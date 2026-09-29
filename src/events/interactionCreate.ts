import { Events, MessageFlags, type Client } from "discord.js";
import { commands } from "../commands/index.ts";
import { logger } from "../logger.ts";
import type { VoiceManager } from "../voice/manager.ts";

const log = logger.child({ module: "event:interaction" });

export function registerInteractionCreate(client: Client, voice: VoiceManager) {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand() || !interaction.inCachedGuild()) return;
    const command = commands.get(interaction.commandName);
    if (!command) return;

    const meta = {
      command: interaction.commandName,
      subcommand: interaction.options.getSubcommand(false),
      guildId: interaction.guildId,
      userId: interaction.user.id,
      userTag: interaction.user.tag,
    };
    const started = performance.now();
    try {
      await command.execute(interaction, voice);
      log.info({ ...meta, durationMs: Math.round(performance.now() - started) }, "command executed");
    } catch (err) {
      log.error({ ...meta, err }, "command failed");
      const reply = { flags: MessageFlags.Ephemeral, content: "Erro ao executar o comando." } as const;
      await (interaction.replied || interaction.deferred ? interaction.followUp(reply) : interaction.reply(reply)).catch(() => {});
    }
  });
}
