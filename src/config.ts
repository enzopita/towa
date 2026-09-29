import { ActivityType, type PresenceData } from "discord.js";
import { z } from "zod";

const snowflake = z.string().regex(/^\d{17,20}$/, "must be a Discord ID (snowflake)");

const optionalString = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());

const activityTypes = {
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing,
  custom: ActivityType.Custom,
} as const;

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    DISCORD_TOKEN: z.string({ error: "required" }).min(50, "bot token looks invalid"),
    ADMIN_USER_ID: optionalString.pipe(snowflake.optional()),
    DATABASE_PATH: z.string().min(1).default("data/bot.sqlite"),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),
    LOG_PRETTY: z.stringbool().optional(),
    RECONNECT_DELAY_MS: z.coerce.number().int().min(1_000).default(5_000),
    CONNECT_TIMEOUT_MS: z.coerce.number().int().min(5_000).default(20_000),
    WATCHDOG_INTERVAL_MS: z.coerce.number().int().min(10_000).default(60_000),
    BOT_STATUS: z.enum(["online", "idle", "dnd", "invisible"]).default("online"),
    ACTIVITY_TYPE: z.enum(Object.keys(activityTypes) as [keyof typeof activityTypes]).default("custom"),
    ACTIVITY_NAME: optionalString.pipe(z.string().max(128).optional()),
    ACTIVITY_URL: optionalString.pipe(z.url().optional()),
  })
  .refine((env) => env.ACTIVITY_TYPE !== "streaming" || env.ACTIVITY_URL, {
    path: ["ACTIVITY_URL"],
    error: "required when ACTIVITY_TYPE=streaming (Twitch or YouTube URL)",
  });

function load() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    console.error(`Invalid configuration:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  const env = result.data;
  const presence: PresenceData = {
    status: env.BOT_STATUS,
    activities: env.ACTIVITY_NAME
      ? [{ name: env.ACTIVITY_NAME, type: activityTypes[env.ACTIVITY_TYPE], url: env.ACTIVITY_URL }]
      : [],
  };
  return Object.freeze({
    env: env.NODE_ENV,
    discord: { token: env.DISCORD_TOKEN, adminUserId: env.ADMIN_USER_ID, presence },
    database: { path: env.DATABASE_PATH },
    log: { level: env.LOG_LEVEL, pretty: env.LOG_PRETTY ?? env.NODE_ENV === "development" },
    voice: {
      reconnectDelayMs: env.RECONNECT_DELAY_MS,
      connectTimeoutMs: env.CONNECT_TIMEOUT_MS,
      watchdogIntervalMs: env.WATCHDOG_INTERVAL_MS,
    },
  });
}

export type Config = ReturnType<typeof load>;
export const config: Config = load();
