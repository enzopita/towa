import { PermissionFlagsBits, type ChatInputCommandInteraction } from "discord.js";
import { config } from "../config.ts";

/** Guild administrator, or the user set in ADMIN_USER_ID. */
export function isAuthorized(interaction: ChatInputCommandInteraction<"cached">) {
  if (config.discord.adminUserId && interaction.user.id === config.discord.adminUserId) return true;
  return interaction.memberPermissions.has(PermissionFlagsBits.Administrator);
}
