const Discord = require("discord.js");
require("dotenv").config();

const token = process.env.token;

const client = new Discord.Client();

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on("message", message => {
    if(message.content == "bowl") {
        message.channel.send("yes")
    }
});

client.login(token);