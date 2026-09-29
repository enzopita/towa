import type { Client } from "discord.js";
import type { VoiceManager } from "../voice/manager.ts";
import { registerInteractionCreate } from "./interactionCreate.ts";
import { registerReady } from "./ready.ts";
import { registerVoiceStateUpdate } from "./voiceStateUpdate.ts";

export function registerEvents(client: Client, voice: VoiceManager) {
  registerReady(client, voice);
  registerInteractionCreate(client, voice);
  registerVoiceStateUpdate(client, voice);
}
