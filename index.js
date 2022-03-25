const Discord = require("discord.js");
const { sensitiveHeaders } = require("http2");
require("dotenv").config();

const token = process.env.token;
const prefix = "keef"
var sesh
var regex = /[0-9]/

const client = new Discord.Client();

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}`);
});

client.on("message", message => {
    if(message.content == "bowl") {
        message.reply({content: "yes"})
    }
});

client.on("message", message => {
    if (message.content.match(new RegExp(prefix + " " + "[0-9]"))) {
        var time = message.content.split(" ")[1]
        console.log(time)
        message.channel.send({content:`schmoke a bowl every ${time} min`})
        var voiceChannel = message.member.voice.channel; //check if user in channel
        // clearInterval(sesh)
        voiceChannel.join().then(connection =>{
            sesh = setInterval(() => {
                connection.play('./audio/smoke_a_bowl.mp3');
                if (message.content == "keef stop") {
                    clearInterval(sesh)
                }
            }, time * 1000 * 60)
        }).catch(err => console.log(err));
    } 
    if (message.content == "keef stop") {
        message.channel.send({content:"okay :3"})
        clearInterval(sesh)
        // voiceChannel.leave()//TODO try this
    }
})

client.login(token);

//add leaves on/off