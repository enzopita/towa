import { ApplicationCommandType, type Client, type Guild } from "discord.js";
import { logger } from "../logger.ts";
import { commands } from "./index.ts";

const log = logger.child({ module: "commands:register" });
const body = () => commands.map((cmd) => cmd.data.toJSON());

/**
 * Registers the commands in a guild. `set` issues a PUT that replaces ALL of
 * the bot's existing commands in that guild (stale ones are removed).
 */
export async function registerGuildCommands(guild: Guild) {
  try {
    const registered = await guild.commands.set(body());
    log.info({ guildId: guild.id, guildName: guild.name, commands: [...registered.map((c) => c.name)] }, "guild commands registered");
  } catch (err) {
    log.error({ guildId: guild.id, guildName: guild.name, err }, "failed to register guild commands");
  }
}

/**
 * Removes stale global commands (so they don't show up twice) and overwrites
 * the commands in every guild the bot is in. Deletes one by one instead of a
 * bulk `set([])`: Discord rejects bulk updates that drop the app's Entry Point
 * command (error 50240), which must be kept.
 */
export async function registerAllCommands(client: Client<true>) {
  try {
    const global = await client.application.commands.fetch();
    const stale = global.filter((c) => c.type !== ApplicationCommandType.PrimaryEntryPoint);
    for (const cmd of stale.values()) await cmd.delete();
    log.info({ removed: [...stale.map((c) => c.name)] }, "stale global commands removed");
  } catch (err) {
    log.error({ err }, "failed to clear global commands");
  }
  // Sequential to stay within rate limits without bursts.
  for (const guild of client.guilds.cache.values()) await registerGuildCommands(guild);
  log.info({ guilds: client.guilds.cache.size }, "command registration finished");
}
