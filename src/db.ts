import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.ts";
import { logger } from "./logger.ts";

const log = logger.child({ module: "db" });

mkdirSync(dirname(config.database.path), { recursive: true });
const db = new Database(config.database.path, { create: true, strict: true });
db.run("PRAGMA journal_mode = WAL");
db.run(`CREATE TABLE IF NOT EXISTS guild_config (
  guild_id   TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`);
log.info({ path: config.database.path }, "database ready");

export type GuildConfig = {
  guild_id: string;
  channel_id: string;
  enabled: number;
  updated_by: string | null;
  updated_at: string;
};

const getStmt = db.query<GuildConfig, [string]>("SELECT * FROM guild_config WHERE guild_id = ?");
const enabledStmt = db.query<GuildConfig, []>("SELECT * FROM guild_config WHERE enabled = 1");
const setStmt = db.query<void, [string, string, string]>(
  `INSERT INTO guild_config (guild_id, channel_id, enabled, updated_by) VALUES (?1, ?2, 1, ?3)
   ON CONFLICT(guild_id) DO UPDATE SET
     channel_id = excluded.channel_id, enabled = 1,
     updated_by = excluded.updated_by, updated_at = datetime('now')`,
);
const disableStmt = db.query<void, [string, string]>(
  "UPDATE guild_config SET enabled = 0, updated_by = ?2, updated_at = datetime('now') WHERE guild_id = ?1",
);

export const guildConfigs = {
  get: (guildId: string) => getStmt.get(guildId) ?? undefined,
  enabled: () => enabledStmt.all(),
  setChannel(guildId: string, channelId: string, userId: string) {
    setStmt.run(guildId, channelId, userId);
    log.info({ guildId, channelId, userId }, "voice channel configured");
  },
  disable(guildId: string, userId: string) {
    disableStmt.run(guildId, userId);
    log.info({ guildId, userId }, "24/7 disabled");
  },
  close: () => db.close(),
};
