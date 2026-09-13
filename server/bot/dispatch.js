const db = require("../db");
const { leaderboardsMap } = require("../state");
const { logGuildError } = require("../log");
const commands = require("./commands");

function mentionPhrases(command) {
  return command.mention || [command.name];
}

function findCommand(text) {
  return commands.find((c) => (c.match ? c.match(text) : mentionPhrases(c).includes(text)));
}

function execute(ctx, input) {
  let text = input;
  let ukMode = false;

  if (text === "") {
    ctx.reply({ content: "sup?" });
    return;
  }

  if (text.endsWith("bruv")) {
    ukMode = true;
    text = text.replace("bruv", "").trim();
  }

  const serv = db.findOrCreateServer(ctx.guild.id, ctx.guild.name);
  const serverId = serv.id;

  if (serv.name !== ctx.guild.name) {
    db.updateServerName(serverId, ctx.guild.name);
    if (leaderboardsMap.get(serverId)) {
      leaderboardsMap.set(serverId, [ctx.guild.name, ...leaderboardsMap.get(serverId).slice(1)]);
    }
  }

  const command = findCommand(text);
  if (!command) {
    ctx.reply({ content: "huh?" }); //TODO: array ["huh?","what?","hmm?"]? TODO: after 3rd huh in a row offer 'keef help'?
    return;
  }

  if (command.run) {
    Promise.resolve(command.run(ctx, { text, ukMode, serverId })).catch((err) =>
      logGuildError(`command ${command.name}`, ctx.guild, err),
    );
  } else {
    ctx.reply({ content: command.response, quiet: command.quiet });
  }
}

module.exports = { mentionPhrases, findCommand, execute };
