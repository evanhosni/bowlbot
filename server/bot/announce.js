// Owner-only. `@keef announce` arms it; the owner's next message (no mention
// needed) goes to every server's system channel. `@keef cancel` drops it.

const bot = require("./client");
const { say } = require("./context");
const { logGuildError } = require("../log");

let ownerId = null;

let announceNext = false;

function fetchOwner() {
  return bot.application
    .fetch()
    .then((application) => {
      ownerId = application.owner.id;
      console.log(`announce enabled for owner ${ownerId}`);
    })
    .catch((err) => console.error("[owner] could not fetch the application owner:", err));
}

function isOwner(message) {
  return Boolean(ownerId) && message.author.id === ownerId;
}

function arm(message) {
  announceNext = true;
  say(message, { content: "ok your next message will be announced. type `@keef cancel` to cancel" });
}

function broadcast(message) {
  announceNext = false;
  let sent = 0;
  bot.guilds.cache.forEach((guild) => {
    if (!guild.systemChannel) return;
    sent++;
    guild.systemChannel.send({ content: message.content }).catch((err) => logGuildError("announce", guild, err));
  });
  say(message, { content: `announced to ${sent} servers` });
}

// Returns true if the message was consumed by a pending announcement.
function interceptPending(message, text) {
  if (!announceNext || !isOwner(message)) return false;
  if (text === "cancel") {
    announceNext = false;
    say(message, { content: "announcement cancelled" });
  } else {
    broadcast(message);
  }
  return true;
}

module.exports = { fetchOwner, isOwner, arm, interceptPending };
