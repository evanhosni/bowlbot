// Owner-only, DM-driven. Any DM the app owner sends keef is offered as an
// announcement: keef asks `yes`/`no`, and on `yes` posts it verbatim to every
// server's system channel. DMs are used because, without the Message Content
// intent, Discord only shows keef the text of messages that mention it or are
// DMs to it. Anyone else who DMs keef just gets an "ayyyy".

const bot = require("./client");
const { say } = require("./context");
const { logGuildError } = require("../log");

let ownerId = null;

let pending = null; // the DM text waiting for a yes/no

function fetchOwner() {
  return bot.application
    .fetch()
    .then((application) => {
      ownerId = application.owner.id;
      console.log(`announcement enabled for owner ${ownerId}`);
    })
    .catch((err) => console.error("[owner] could not fetch the application owner:", err));
}

function isOwner(message) {
  return Boolean(ownerId) && message.author.id === ownerId;
}

function broadcast(message, content) {
  let sent = 0;
  bot.guilds.cache.forEach((guild) => {
    if (!guild.systemChannel) return;
    sent++;
    guild.systemChannel.send({ content }).catch((err) => logGuildError("announcement", guild, err));
  });
  say(message, { content: `announced to ${sent} servers` });
}

function handleDm(message) {
  if (!isOwner(message)) {
    say(message, { content: "a" + "y".repeat(1 + Math.floor(Math.random() * 24)) });
    return;
  }
  const content = message.content.trim();
  if (content === "") return;

  if (pending !== null && content.toLowerCase() === "yes") {
    const text = pending;
    pending = null;
    broadcast(message, text);
    return;
  }
  if (pending !== null && content.toLowerCase() === "no") {
    pending = null;
    say(message, { content: "kk, not sending it" });
    return;
  }
  if (content.toLowerCase() === "yes" || content.toLowerCase() === "no") {
    say(message, { content: "nothing pending. DM me the announcement first, then i'll ask for confirmation" });
    return;
  }

  pending = content;
  say(message, { content: "would you like me to send this as an announcement? (`yes`/`no`)" });
}

bot.once("clientReady", fetchOwner);

bot.on("messageCreate", (message) => {
  if (message.author.bot || message.guild) return;
  try {
    handleDm(message);
  } catch (err) {
    logGuildError("announcement dm", null, err);
  }
});

module.exports = { handleDm };
