// Owner-only. `@keef announcement` arms it; the owner's next `@keef <text>` message
// goes to every server's system channel with the mention stripped. `@keef cancel`
// drops it. The mention is required: without the Message Content intent, Discord
// only shows keef the text of messages that mention it.

const bot = require("./client");
const { say } = require("./context");
const { logGuildError } = require("../log");

let ownerId = null;

let announcementNext = false;

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

function arm(message) {
  announcementNext = true;
  say(message, {
    content: "ok. your next message that @mentions me will be announced (mention stripped). type `@keef cancel` to cancel",
  });
}

function broadcast(message, content) {
  announcementNext = false;
  let sent = 0;
  bot.guilds.cache.forEach((guild) => {
    if (!guild.systemChannel) return;
    sent++;
    guild.systemChannel.send({ content }).catch((err) => logGuildError("announcement", guild, err));
  });
  say(message, { content: `announced to ${sent} servers` });
}

// Returns true if the message was consumed by a pending announcement.
function interceptPending(message) {
  if (!announcementNext || !isOwner(message)) return false;
  if (!message.mentions.has(bot.user)) return false;
  const content = message.content.replace(`<@${bot.user.id}>`, "").trim();
  if (content.toLowerCase() === "cancel") {
    announcementNext = false;
    say(message, { content: "announcement cancelled" });
  } else if (content === "") {
    say(message, { content: "that was empty. still waiting for the announcement" });
  } else {
    broadcast(message, content);
  }
  return true;
}

module.exports = { fetchOwner, isOwner, arm, interceptPending };
