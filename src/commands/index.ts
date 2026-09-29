import { Collection } from "discord.js";
import type { Command } from "./types.ts";
import { voiceCommand } from "./voice.ts";

export const commands = new Collection<string, Command>([voiceCommand].map((c) => [c.data.name, c]));
export type { Command } from "./types.ts";
