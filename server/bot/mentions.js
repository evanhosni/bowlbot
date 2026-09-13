const bot = require("./client");
const announce = require("./announce");
const { messageContext } = require("./context");
const { execute } = require("./dispatch");
const { logGuildError } = require("../log");

function getMessage(message) {
  return message.content.toLowerCase().replace(`<@${bot.user.id}>`, "").trim();
}

function handleMessage(message) {
  if (message.author.bot) return;
  if (announce.interceptPending(message, getMessage(message))) return;
  if (message.mentions.here) return;
  if (message.mentions.everyone) return;
  if (!message.mentions.has(bot.user)) return;
  if (!message.guild) return;

  const msg = getMessage(message);

  // Hidden, owner only. Anyone else falls through to "huh?".
  if (msg === "announce" && announce.isOwner(message)) {
    announce.arm(message);
    return;
  }

  execute(messageContext(message), msg);
}

bot.on("messageCreate", (message) => {
  try {
    handleMessage(message);
  } catch (err) {
    logGuildError("messageCreate", message.guild, err);
  }
});

module.exports = { getMessage, handleMessage };
