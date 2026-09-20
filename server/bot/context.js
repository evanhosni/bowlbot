const Discord = require("discord.js");
const { describeGuild, logGuildError, ownerWarn } = require("../log");

// Discord refuses a response: the 3s window closed, or something else answered first.
const UNANSWERABLE = { 10062: "unknown interaction", 40060: "already acknowledged" };

function say(message, payload) {
  return message.channel.send(payload).catch((err) => logGuildError("send", message.guild, err));
}

function messageContext(message) {
  const send = (payload) => {
    const { quiet, ...rest } = payload;
    return say(message, rest);
  };
  return {
    guild: message.guild,
    channelId: message.channel.id,
    member: message.member,
    user: message.author,
    defer: () => message.channel.sendTyping().catch(() => {}),
    reply: send,
    announce: send,
  };
}

function interactionContext(interaction) {
  let replied = false;
  let deferred = false;
  let unanswerable = false;
  const received = Date.now() - interaction.createdTimestamp;
  const failed = (where) => (err) => {
    const reason = err && UNANSWERABLE[err.code];
    if (!reason) return logGuildError(where, interaction.guild, err);
    unanswerable = true;
    ownerWarn(
      `[${where}] ${describeGuild(interaction.guild)} [${err.code}]: ${reason} ` +
        `(received +${received}ms, failed +${Date.now() - interaction.createdTimestamp}ms) - ` +
        `took too long to answer, or another instance of this bot answered first`,
    );
  };
  return {
    guild: interaction.guild,
    channelId: interaction.channelId,
    member: interaction.member,
    user: interaction.user,
    defer() {
      if (unanswerable) return Promise.resolve();
      deferred = true;
      return interaction.deferReply().catch((err) => {
        deferred = false;
        failed("interaction defer")(err);
      });
    },
    reply(payload) {
      if (unanswerable) return Promise.resolve();
      const { quiet, ...rest } = payload;
      if (quiet) rest.flags = Discord.MessageFlags.Ephemeral;
      let p;
      if (replied) p = interaction.followUp(rest);
      else if (deferred) p = interaction.editReply(rest);
      else p = interaction.reply(rest);
      replied = true;
      return p.catch(failed("interaction reply"));
    },
    announce(payload) {
      const { quiet, ...rest } = payload;
      if (!interaction.channel) {
        ownerWarn(`[announce] ${describeGuild(interaction.guild)}: no channel on interaction, dropping message`);
        return Promise.resolve();
      }
      return interaction.channel.send(rest).catch((err) => logGuildError("send", interaction.guild, err));
    },
  };
}

module.exports = { say, messageContext, interactionContext };
