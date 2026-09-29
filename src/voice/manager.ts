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

/** Keeps the bot connected to the configured voice channel in every guild. */
export class VoiceManager {
  private readonly pending = new Map<string, Timer>();
  private readonly attempts = new Map<string, number>();
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
    // Exponential backoff capped at 5 min so we don't hammer the API.
    const wait = Math.min(config.voice.reconnectDelayMs * 2 ** Math.min(attempt - 1, 6), 300_000);
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
    const ctx = { guildId, guildName: channel.guild.name, channelId: channel.id, channelName: channel.name };
    getVoiceConnection(guildId)?.destroy();

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: true,
      debug: true,
    });

    // Last handshake steps, attached to failure logs to show where the connection stalled.
    const trail: string[] = [];
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

    return connection;
  }
}
