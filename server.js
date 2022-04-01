const Discord = require("discord.js");
require("dotenv").config();
// const server = require("http").createServer()
// const { sensitiveHeaders } = require("http2");//TODO: is this used?

//NEW SERVER STUFF (EXPRESS)
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000
// app.use(express.static("public"))
app.use(express.urlencoded({extended:true}))//
app.use(express.json())//
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, '/index.html'))
);
app.listen(PORT,()=>{
    console.log(`listening at http://localhost:${PORT} 🚀`)
})

const options = {cors: {origin: "*"}}
const io = require("socket.io")(server, options);
io.on("connection", (socket) => {
    console.log("we're one, brother")
    Bowl.count().then(bowl => {
        io.emit('bowlcount', bowl)
    })
});
// server.listen(process.env.PORT || 3000);

const sequelize = require('./db/connection')
const Op = sequelize.Op 
const moment = require("moment")
const {ServerStats} = require('./db/models')
const {Bowl} = require('./db/models')

const token = process.env.token;
let sesh = new Map()
var prefix = "keef"

const client = new Discord.Client();

client.on("ready", () => {
    console.log(`ayyooo it's ${client.user.tag}`);
    console.log(client.guilds.cache.map(g => g.name).join('\n'))
});

client.on("guildCreate", guild => {
    // guild.owner.send('Thanks! You can use +help to discover commands.')
    ServerStats.create({id: guild.id, serverName: guild.name }).then(res=>{console.log(res)})
});

client.on("message", message => {
    var voiceChannel = message.member.voice.channel;
    if (message.content.match(new RegExp(prefix + " " + "[0-9]")) && message.member.voice.channel) {//TODO regex for unknown amount of spaces?
        var time = message.content.split(" ")[1]
        if (time < 0.1) {//TODO change to 1
            message.channel.send({content:"woah slow down buddy"})
            return
        }
        if (time > 1440) {
            message.channel.send({content:"sorry bud i have work in the morning"})
            return
        }
        if (time == 420) {
            message.channel.send({content:"ayyy lmao"})
        }
        message.channel.send({content:`schmoke a bowl every ${time} min`})

        clearInterval(sesh.get(message.guild.id))//more safetys to ensure loop doesn't continue past keef leaving
        voiceChannel.join().then(connection =>{
            sesh.set(message.guild.id,setInterval(() => {
                console.log(sesh.get(message.guild.id))
                connection.play('./audio/smoke_a_bowl.mp3');
                // ServerStats.findOrCreate({where: {id: message.guild.id}, defaults: {id: message.guild.id, serverName: message.guild.name}}).then(serv => {//TODO something like this but higher, so the server is accessible in all parts of client.on("message")
                ServerStats.findByPk(message.guild.id).then(serv => {//TODO if server not in db, create it
                    serv.createBowl().then(() => {
                        Bowl.count().then(bowl => {
                            io.emit('bowlcount', bowl)
                        })
                    })
                })
            }, time * 1000 * 60))
        }).catch(err => console.log(err));
    } 
    if (message.content == prefix + " " + "stop") {//TODO glitches/crashes if nobody in call
        message.channel.send({content:"okay :3"})
        clearInterval(sesh.get(message.guild.id))
        sesh.delete(message.guild.id)//more safetys to ensure loop doesn't continue/map deleted past keef leaving
        voiceChannel.leave()
    }
    if (message.content == prefix + " " + "stats") {
        Bowl.count({where: {serverstatId: message.guild.id}}).then(bowl => { //TODO better formatting?
            message.channel.send({content:"you've schmoked a total of " + bowl + " bowls:"})
        })
        Bowl.count({where: {serverstatId: message.guild.id, createdAt: {[Op.gte]: moment().subtract(1, 'years').toDate()}}}).then(bowl => {
            message.channel.send({content:bowl + " bowls in the past year"})
        })
        Bowl.count({where: {serverstatId: message.guild.id, createdAt: {[Op.gte]: moment().subtract(1, 'months').toDate()}}}).then(bowl => {
            message.channel.send({content:bowl + " bowls in the past month"})
        })
        Bowl.count({where: {serverstatId: message.guild.id, createdAt: {[Op.gte]: moment().subtract(1, 'weeks').toDate()}}}).then(bowl => {
            message.channel.send({content:bowl + " bowls in the past week"})
        })
        Bowl.count({where: {serverstatId: message.guild.id, createdAt: {[Op.gte]: moment().subtract(1, 'days').toDate()}}}).then(bowl => {
            message.channel.send({content:bowl + " bowls in the past day"})
        })
        Bowl.count({where: {serverstatId: message.guild.id, createdAt: {[Op.gte]: moment().subtract(1, 'hours').toDate()}}}).then(bowl => {//TODO why does the last one always take forever? its only because this is the 6th. it can do 5 without issue
            message.channel.send({content:bowl + " bowls in the past hour"})
        })
    }
    if (message.content == prefix + " " + "b") {
        console.log(sesh)
    }
})

client.login(token);

sequelize.sync({
// force: true
}).then((res) => {
    // console.log(res)
}).catch((err) => {
    console.log(err)
})