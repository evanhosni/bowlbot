const Discord = require("discord.js");
const bot = require("./client");
const commands = require("./commands");
const { interactionContext } = require("./context");
const { execute, mentionPhrases } = require("./dispatch");
const { logGuildError, ownerError } = require("../log");

const slashCommands = commands.filter((c) => c.slash !== false);

function slashDefinition(command) {
  const builder = new Discord.SlashCommandBuilder()
    .setName(command.name)
    .setDescription(command.description)
    .setContexts(Discord.InteractionContextType.Guild);
  if (command.adminOnly) builder.setDefaultMemberPermissions(Discord.PermissionFlagsBits.Administrator);
  if (command.option) {
    const { name, description, required = true, choices } = command.option;
    builder.addStringOption((opt) => {
      opt.setName(name).setDescription(description).setRequired(required);
      if (choices) opt.addChoices(...choices.map((v) => ({ name: v, value: v })));
      return opt;
    });
  }
  if (command.sub) {
    builder.addSubcommand((sub) => sub.setName(command.sub.name).setDescription(command.sub.description));
  }
  return builder.toJSON();
}

function slashToText(command, interaction) {
  const phrase = mentionPhrases(command)[0];
  if (!command.option) return phrase;
  const value = (interaction.options.getString(command.option.name) || "").toLowerCase().trim();
  if (command.option.standalone) return value;
  return value ? `${phrase} ${value}` : phrase;
}

function registerSlashCommands() {
  return bot.application.commands
    .set(slashCommands.map(slashDefinition))
    .catch((err) => ownerError("[slash] could not register commands:", err && err.stack ? err.stack : err));
}

function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;
  const command = slashCommands.find((c) => c.name === interaction.commandName);
  if (!command) return;
  if (!interaction.guild || !interaction.member) {
    interaction
      .reply({ content: "i only work inside a server", flags: Discord.MessageFlags.Ephemeral })
      .catch((err) => logGuildError("interaction reply", interaction.guild, err));
    return;
  }

  execute(interactionContext(interaction), slashToText(command, interaction));
}

bot.on("interactionCreate", (interaction) => {
  try {
    handleInteraction(interaction);
  } catch (err) {
    logGuildError("interactionCreate", interaction.guild, err);
  }
});

module.exports = { slashDefinition, slashToText, registerSlashCommands, handleInteraction };
