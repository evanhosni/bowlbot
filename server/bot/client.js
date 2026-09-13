const Discord = require("discord.js");

const bot = new Discord.Client({
  intents: [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMessages,
    Discord.GatewayIntentBits.GuildVoiceStates,
    Discord.GatewayIntentBits.DirectMessages,
  ],
  // DM channels aren't cached until first seen; without this DM messages are dropped.
  partials: [Discord.Partials.Channel],
});

module.exports = bot;
