const bot = require("./client");
const { messageContext } = require("./context");
const { execute } = require("./dispatch");
const { logGuildError } = require("../log");

function getMessage(message) {
  return message.content.toLowerCase().replace(`<@${bot.user.id}>`, "").trim();
}

function handleMessage(message) {
  if (message.author.bot) return;
  if (!message.guild) return;
  if (message.mentions.here) return;
  if (message.mentions.everyone) return;
  if (!message.mentions.has(bot.user)) return;

  execute(messageContext(message), getMessage(message));
}

bot.on("messageCreate", (message) => {
  try {
    handleMessage(message);
  } catch (err) {
    logGuildError("mention", message.guild, err);
  }
});

module.exports = { getMessage, handleMessage };
