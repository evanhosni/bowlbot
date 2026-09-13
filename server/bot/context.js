// announce() exists because interaction tokens expire after 15 minutes, long
// before a session tick is done posting.

const Discord = require("discord.js");
const { describeGuild, logGuildError, ownerWarn } = require("../log");

// Discord will not take a response for this interaction: either the 3s window closed or
// something else answered it first.
const UNANSWERABLE = { 10062: "unknown interaction", 40060: "already acknowledged" };

// A second instance of the bot racing this one produces one of these per command, so only
// the first reaches the DMs. A restart arms it again.
let raceReported = false;

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
  let unanswerable = false;
  // How old the interaction already was when it reached us: past ~3s and the token died
  // before we saw it, while a fast receive plus a refused response means we lost a race.
  const received = Date.now() - interaction.createdTimestamp;
  const failed = (where) => (err) => {
    const reason = err && UNANSWERABLE[err.code];
    if (!reason) return logGuildError(where, interaction.guild, err);
    unanswerable = true;
    const line =
      `[${where}] ${describeGuild(interaction.guild)} [${err.code}]: ${reason} ` +
      `(received +${received}ms, failed +${Date.now() - interaction.createdTimestamp}ms) - ` +
      `took too long to answer, or another instance of this bot answered first`;
    if (raceReported) return console.log(line);
    raceReported = true;
    ownerWarn(line);
  };
  return {
    guild: interaction.guild,
    member: interaction.member,
    user: interaction.user,
    defer() {
      if (unanswerable) return Promise.resolve();
      // Set first so a reply racing the round trip still edits, but roll back on failure:
      // editReply() on an interaction that never deferred throws InteractionNotReplied and
      // buries the real error underneath it.
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
