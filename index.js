const Discord = require("discord.js");
const { sensitiveHeaders } = require("http2");
require("dotenv").config();

const token = process.env.token;
var prefix = "keef"
var sesh

const client = new Discord.Client();

client.on("ready", () => {
    console.log(`ayyooo it's ${client.user.tag}`);
});

client.on("message", message => {
    var voiceChannel = message.member.voice.channel;
    if (message.content.match(new RegExp(prefix + " " + "[0-9]")) && message.member.voice.channel) {//TODO regex for unknown amount of spaces?
        var time = message.content.split(" ")[1]
        if (time < 1) {
            message.channel.send({content:"woah slow down buddy"})
            return
        }
        message.channel.send({content:`schmoke a bowl every ${time} min`})
        clearInterval(sesh)
        voiceChannel.join().then(connection =>{
            sesh = setInterval(() => {
                connection.play('./audio/smoke_a_bowl.mp3');
                if (message.content == "keef stop") {
                    clearInterval(sesh)
                }
            }, time * 1000 * 60)
        }).catch(err => console.log(err));
    } 
    if (message.content == prefix + " " + "stop") {
        message.channel.send({content:"okay :3"})
        clearInterval(sesh)
        voiceChannel.leave()
    }
})

client.login(token);

//add leaves on/off