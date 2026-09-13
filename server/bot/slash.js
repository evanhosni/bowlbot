// Slash commands only appear in servers that granted the `applications.commands`
// OAuth scope. Per-guild syncs 403 in the others; logged and harmless.

const Discord = require("discord.js");
const bot = require("./client");
const db = require("../db");
const commands = require("./commands");
const { interactionContext } = require("./context");
const { execute, mentionPhrases } = require("./dispatch");
const { describeGuild, logGuildError } = require("../log");

const slashCommands = commands.filter((c) => c.slash !== false);
const globalSlashCommands = slashCommands.filter((c) => !c.perGuild);
const perGuildSlashCommands = slashCommands.filter((c) => c.perGuild);

function slashDefinition(command) {
  const builder = new Discord.SlashCommandBuilder().setName(command.name).setDescription(command.description);
  // Discord rejects `contexts` on guild commands.
  if (!command.perGuild) builder.setContexts(Discord.InteractionContextType.Guild);
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

// Call after anything that changes the server's db row.
function syncGuildCommands(guild) {
  const serv = db.findServer(guild.id) || { rank: false };
  const defs = perGuildSlashCommands.filter((c) => c.perGuild(serv, guild)).map(slashDefinition);
  return guild.commands.set(defs).catch((err) => {
    // 50001: the server never granted applications.commands. Expected for old installs.
    if (err && err.code === 50001) {
      console.log(`[sync guild commands] ${describeGuild(guild)}: no applications.commands scope, skipping`);
      return;
    }
    logGuildError("sync guild commands", guild, err);
  });
}

// Sequential to stay clear of the global rate limit.
async function syncAllGuildCommands() {
  let n = 0;
  for (const guild of bot.guilds.cache.values()) {
    await syncGuildCommands(guild);
    n++;
  }
  console.log(`synced per-guild commands in ${n} guild(s)`);
}

function registerSlashCommands() {
  return bot.application.commands
    .set(globalSlashCommands.map(slashDefinition))
    .then((cmds) =>
      console.log(`registered ${cmds.size} slash command(s): ${cmds.map((c) => "/" + c.name).join(", ")}`),
    )
    .then(() => syncAllGuildCommands())
    .catch((err) => console.error("[slash] could not register commands:", err && err.stack ? err.stack : err));
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

module.exports = { slashDefinition, slashToText, syncGuildCommands, registerSlashCommands, handleInteraction };
