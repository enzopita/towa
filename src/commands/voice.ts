import { ChannelType, InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { guildConfigs } from "../db.ts";
import { logger } from "../logger.ts";
import { isAuthorized } from "./permissions.ts";
import type { Command } from "./types.ts";

const log = logger.child({ module: "command:voice" });
const ephemeral = MessageFlags.Ephemeral;
const voiceChannelTypes = [ChannelType.GuildVoice, ChannelType.GuildStageVoice] as const;

export const voiceCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("voice")
    .setDescription("Configura o canal de voz onde o bot fica 24/7")
    .setContexts(InteractionContextType.Guild)
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Define o canal de voz e conecta o bot")
        .addChannelOption((o) =>
          o
            .setName("canal")
            .setDescription("Canal de voz")
            .addChannelTypes(...voiceChannelTypes)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName("leave").setDescription("Desconecta o bot e desativa o 24/7"))
    .addSubcommand((s) => s.setName("status").setDescription("Mostra a configuração atual")),

  async execute(interaction, voice) {
    const sub = interaction.options.getSubcommand();
    const ctx = { guildId: interaction.guildId, userId: interaction.user.id, subcommand: sub };

    if (sub === "status") {
      const cfg = guildConfigs.get(interaction.guildId);
      const connected = interaction.guild.members.me?.voice.channelId;
      return interaction.reply({
        flags: ephemeral,
        content: cfg?.enabled
          ? `Canal configurado: <#${cfg.channel_id}>\nConectado agora: ${connected ? `<#${connected}>` : "não"}`
          : "Nenhum canal configurado.",
      });
    }

    if (!isAuthorized(interaction)) {
      log.warn(ctx, "unauthorized change attempt");
      return interaction.reply({ flags: ephemeral, content: "Apenas administradores podem alterar essa configuração." });
    }

    if (sub === "set") {
      const channel = interaction.options.getChannel("canal", true, [...voiceChannelTypes]);
      const me = interaction.guild.members.me;
      if (!me || !channel.permissionsFor(me).has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
        log.warn({ ...ctx, channelId: channel.id }, "bot lacks permission in channel");
        return interaction.reply({ flags: ephemeral, content: `Não tenho permissão para entrar em ${channel}.` });
      }
      guildConfigs.setChannel(interaction.guildId, channel.id, interaction.user.id);
      voice.join(channel);
      return interaction.reply({ flags: ephemeral, content: `Pronto! Vou ficar 24/7 em ${channel}.` });
    }

    if (sub === "leave") {
      guildConfigs.disable(interaction.guildId, interaction.user.id);
      voice.leave(interaction.guildId);
      return interaction.reply({ flags: ephemeral, content: "Saí do canal e desativei o 24/7." });
    }
  },
};
