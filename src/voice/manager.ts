import type { Client, VoiceBasedChannel } from "discord.js";
import {
  entersState,
  getVoiceConnection,
  getVoiceConnections,
  joinVoiceChannel,
  VoiceConnectionStatus,
  type VoiceConnection,
} from "@discordjs/voice";
import { config } from "../config.ts";
import { guildConfigs, type GuildConfig } from "../db.ts";
import { logger } from "../logger.ts";

const log = logger.child({ module: "voice" });

// Listen-only presence: never sends or receives audio.
const VOICE_FLAGS = { selfDeaf: true, selfMute: true } as const;
// A kick or move usually recovers on the first try, so it isn't delayed by the backoff.
const FIRST_RETRY_MS = 1_000;

type ConnectionContext = { guildId: string; guildName: string; channelId: string; channelName: string };

/** Keeps the bot connected to the configured voice channel in every guild. */
export class VoiceManager {
  private readonly pending = new Map<string, Timer>();
  private readonly attempts = new Map<string, number>();
  private readonly trails = new WeakMap<VoiceConnection, string[]>();
  private watchdog?: Timer;

  constructor(private readonly client: Client) {}

  start() {
    this.syncAll("startup");
    this.watchdog = setInterval(() => this.syncAll("watchdog"), config.voice.watchdogIntervalMs);
  }

  stop() {
    clearInterval(this.watchdog);
    for (const timer of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    for (const connection of getVoiceConnections().values()) connection.destroy();
  }

  syncAll(reason: string) {
    const configs = guildConfigs.enabled();
    log.debug({ reason, guilds: configs.length }, "syncing connections");
    for (const cfg of configs) void this.ensureConnected(cfg.guild_id, reason, cfg);
  }

  scheduleReconnect(guildId: string, reason: string) {
    if (this.pending.has(guildId)) return;
    const attempt = (this.attempts.get(guildId) ?? 0) + 1;
    this.attempts.set(guildId, attempt);
    // First retry is near-immediate (usually a kick/move); then exponential backoff
    // capped at 5 min so a persistent failure doesn't hammer the API.
    const backoff = config.voice.reconnectDelayMs * 2 ** Math.min(attempt - 2, 6);
    const wait = attempt === 1 ? FIRST_RETRY_MS : Math.min(backoff, 300_000);
    log.info({ guildId, reason, attempt, delayMs: wait }, "reconnect scheduled");
    this.pending.set(
      guildId,
      setTimeout(() => {
        this.pending.delete(guildId);
        void this.ensureConnected(guildId, reason);
      }, wait),
    );
  }

  private cancel(guildId: string) {
    clearTimeout(this.pending.get(guildId));
    this.pending.delete(guildId);
    this.attempts.delete(guildId);
  }

  leave(guildId: string) {
    this.cancel(guildId);
    getVoiceConnection(guildId)?.destroy();
    log.info({ guildId }, "left voice channel");
  }

  /** Single reconciliation point: compares the desired channel with the current one and connects if needed. */
  async ensureConnected(guildId: string, reason: string, cfg: GuildConfig | undefined = guildConfigs.get(guildId)) {
    if (!cfg?.enabled) return;
    // A backed-off retry is already scheduled; don't preempt it.
    if (this.pending.has(guildId)) return;

    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) {
      log.warn({ guildId }, "bot is no longer in the configured guild");
      return;
    }

    const connection = getVoiceConnection(guildId);
    if (
      connection?.state.status === VoiceConnectionStatus.Ready &&
      guild.members.me?.voice.channelId === cfg.channel_id
    ) {
      // @discordjs/voice often recovers on its own before the scheduled retry runs.
      if (this.attempts.delete(guildId)) log.info({ guildId, guildName: guild.name, reason }, "back in voice channel");
      return;
    }

    const channel =
      guild.channels.cache.get(cfg.channel_id) ?? (await guild.channels.fetch(cfg.channel_id).catch(() => null));
    if (!channel?.isVoiceBased()) {
      log.error({ guildId, guildName: guild.name, channelId: cfg.channel_id }, "configured channel does not exist or is not a voice channel");
      return;
    }

    log.info({ guildId, guildName: guild.name, channelId: channel.id, reason }, "connecting to voice channel");
    this.connect(channel);
  }

  /** Explicitly requested connection (/voice set): resets the backoff and connects immediately. */
  join(channel: VoiceBasedChannel): VoiceConnection {
    this.cancel(channel.guild.id);
    return this.connect(channel);
  }

  private connect(channel: VoiceBasedChannel): VoiceConnection {
    const guildId = channel.guild.id;
    const ctx: ConnectionContext = { guildId, guildName: channel.guild.name, channelId: channel.id, channelName: channel.name };

    // Reuse a live connection: rejoin() moves it without leaving the channel first.
    // Destroying it would emit a "left channel" voice state that schedules yet another reconnect.
    const existing = getVoiceConnection(guildId);
    if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
      if (existing.rejoin({ channelId: channel.id, ...VOICE_FLAGS })) {
        this.awaitReady(existing, ctx);
        return existing;
      }
      existing.destroy();
    }

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      ...VOICE_FLAGS,
      debug: true,
    });

    // Last handshake steps, attached to failure logs to show where the connection stalled.
    const trail: string[] = [];
    this.trails.set(connection, trail);
    connection.on("debug", (msg) => {
      trail.push(msg.slice(0, 300));
      if (trail.length > 15) trail.shift();
    });

    connection.on("stateChange", (oldState, newState) => {
      log.debug({ ...ctx, from: oldState.status, to: newState.status }, "voice connection state changed");
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        // May just be a region/channel switch: give it a chance to recover on its own.
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        log.warn({ ...ctx, trail }, "voice connection lost");
        connection.destroy();
        this.scheduleReconnect(guildId, "disconnected");
      }
    });

    connection.on("error", (err) => log.error({ ...ctx, err }, "voice connection error"));

    this.awaitReady(connection, ctx);
    return connection;
  }

  private awaitReady(connection: VoiceConnection, ctx: ConnectionContext) {
    const { guildId } = ctx;
    const trail = this.trails.get(connection);
    entersState(connection, VoiceConnectionStatus.Ready, config.voice.connectTimeoutMs)
      .then(() => {
        this.attempts.delete(guildId);
        log.info(ctx, "connected to voice channel");
      })
      .catch((err) => {
        log.warn(
          { ...ctx, err, timeoutMs: config.voice.connectTimeoutMs, status: connection.state.status, trail },
          "failed to connect",
        );
        connection.destroy();
        this.scheduleReconnect(guildId, "connect-timeout");
      });
  }
}
