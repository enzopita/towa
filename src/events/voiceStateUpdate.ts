import { Events, type Client } from "discord.js";
import { guildConfigs } from "../db.ts";
import { logger } from "../logger.ts";
import type { VoiceManager } from "../voice/manager.ts";

const log = logger.child({ module: "event:voice-state" });

/** Kicked, moved or manually disconnected: go back to the configured channel. */
export function registerVoiceStateUpdate(client: Client, voice: VoiceManager) {
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    if (newState.id !== client.user?.id) return;
    const cfg = guildConfigs.get(newState.guild.id);
    if (!cfg?.enabled || newState.channelId === cfg.channel_id) return;

    log.warn(
      { guildId: newState.guild.id, from: oldState.channelId, to: newState.channelId, expected: cfg.channel_id },
      newState.channelId ? "bot moved to another channel" : "bot removed from channel",
    );
    voice.scheduleReconnect(newState.guild.id, "voice-state-changed");
  });
}
