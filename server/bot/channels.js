const Discord = require("discord.js");

const POST = [Discord.PermissionFlagsBits.ViewChannel, Discord.PermissionFlagsBits.SendMessages];

function postableSystemChannel(guild) {
  const channel = guild.systemChannel;
  if (!channel) return { channel: null, reason: "no system channel" };
  const perms = channel.permissionsFor(guild.members.me);
  if (perms && !perms.has(POST)) {
    return { channel: null, reason: `can't post in system channel #${channel.name}` };
  }
  return { channel, canMentionEveryone: !perms || perms.has(Discord.PermissionFlagsBits.MentionEveryone) };
}

module.exports = { postableSystemChannel };
