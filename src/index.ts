import { Client, GatewayIntentBits } from "discord.js";
import { config } from "./config.ts";
import { guildConfigs } from "./db.ts";
import { registerEvents } from "./events/index.ts";
import { logger } from "./logger.ts";
import { VoiceManager } from "./voice/manager.ts";

// Presence is sent on every gateway identify, so it survives reconnects.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  presence: config.discord.presence,
});
const voice = new VoiceManager(client);
registerEvents(client, voice);

process.on("unhandledRejection", (err) => logger.error({ err }, "unhandledRejection"));
process.on("uncaughtException", (err) => logger.fatal({ err }, "uncaughtException"));

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down");
  voice.stop();
  await client.destroy();
  guildConfigs.close();
  logger.flush();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

logger.info({ env: config.env, logLevel: config.log.level, adminUserId: config.discord.adminUserId, presence: config.discord.presence }, "starting");
await client.login(config.discord.token).catch((err) => {
  logger.fatal({ err }, "Discord login failed");
  logger.flush();
  process.exit(1);
});
