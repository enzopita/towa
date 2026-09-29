import { Events, type Client } from "discord.js";
import { registerAllCommands, registerGuildCommands } from "../commands/register.ts";
import { logger } from "../logger.ts";
import type { VoiceManager } from "../voice/manager.ts";

const log = logger.child({ module: "event:ready" });

export function registerReady(client: Client, voice: VoiceManager) {
  client.once(Events.ClientReady, async (c) => {
    log.info({ user: c.user.tag, userId: c.user.id, guilds: c.guilds.cache.size }, "bot online");
    voice.start();
    await registerAllCommands(c);
  });

  client.on(Events.GuildCreate, (guild) => {
    log.info({ guildId: guild.id, guildName: guild.name }, "bot added to a guild");
    void registerGuildCommands(guild);
  });

  client.on(Events.ShardResume, (shardId, replayed) => {
    log.info({ shardId, replayed }, "gateway resumed");
    voice.syncAll("shard-resume");
  });
  client.on(Events.ShardDisconnect, (event, shardId) => log.warn({ shardId, code: event.code }, "gateway disconnected"));
  client.on(Events.Warn, (msg) => log.warn({ msg }, "discord.js warning"));
  client.on(Events.Error, (err) => log.error({ err }, "client error"));
}
