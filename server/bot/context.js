// A context is { guild, member, user, defer, reply, announce }. `payload.quiet`
// means ephemeral where supported. defer() is for commands that take a moment:
// it shows a typing indicator (mention) or acknowledges the interaction (slash)
// so Discord doesn't time out. announce() is for messages sent long after the
// command (the session tick); interaction tokens expire after 15 minutes.

const Discord = require("discord.js");
const { describeGuild, logGuildError } = require("../log");

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
  return {
    guild: interaction.guild,
    member: interaction.member,
    user: interaction.user,
    defer() {
      deferred = true;
      return interaction.deferReply().catch((err) => logGuildError("interaction defer", interaction.guild, err));
    },
    reply(payload) {
      const { quiet, ...rest } = payload;
      if (quiet) rest.flags = Discord.MessageFlags.Ephemeral;
      let p;
      if (replied) p = interaction.followUp(rest);
      else if (deferred) p = interaction.editReply(rest);
      else p = interaction.reply(rest);
      replied = true;
      return p.catch((err) => logGuildError("interaction reply", interaction.guild, err));
    },
    announce(payload) {
      const { quiet, ...rest } = payload;
      if (!interaction.channel) {
        console.log(`[announce] ${describeGuild(interaction.guild)}: no channel on interaction, dropping message`);
        return Promise.resolve();
      }
      return interaction.channel.send(rest).catch((err) => logGuildError("send", interaction.guild, err));
    },
  };
}

module.exports = { say, messageContext, interactionContext };
