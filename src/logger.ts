import pino from "pino";
import { config } from "./config.ts";

export const logger = pino({
  level: config.log.level,
  base: { service: "towa" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: ["token", "*.token"], censor: "[REDACTED]" },
  // In JSON mode, emit "level" as a label ("info") instead of a number so log aggregators can filter on it.
  formatters: config.log.pretty ? undefined : { level: (label) => ({ level: label }) },
  transport: config.log.pretty
    ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" } }
    : undefined,
});

export type Logger = typeof logger;
