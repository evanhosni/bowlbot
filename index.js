const Discord = require("discord.js");
const { sensitiveHeaders } = require("http2");
require("dotenv").config();

const token = process.env.token;
const prefix = "keef "
var sesh

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
    if (message.content.match(/^keef ([0-9])/)) {//TODO use prefix var instead
        var time = message.content.split(" ")[1]
        message.channel.send({content:`schmoke a bowl every ${time} min`})
        var voiceChannel = message.member.voice.channel;
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
    if (message.content == "keef stop") {
        message.channel.send({content:"okay :3"})
        clearInterval(sesh)
    }
})

// function sesh() {
//     var voiceChannel = message.member.voice.channel;
//     voiceChannel.join().then(connection =>{
//         const dispatcher = connection.play('./audio/wait.wav');
//         dispatcher.on("end", end => {voiceChannel.leave();});
//     }).catch(err => console.log(err));
// }

client.login(token);

//add leaves on/off