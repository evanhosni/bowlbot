const Discord = require("discord.js");
require("dotenv").config();
// const { sensitiveHeaders } = require("http2");//TODO: is this used?

//NEW SERVER STUFF (EXPRESS)
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000
// app.use(express.urlencoded({extended:true}))//
// app.use(express.json())//
app.get('/', (req, res) =>
res.sendFile(path.join(__dirname, '/index.html'))
);
// https://console.cron-job.org/jobs (for ping scheduling maintenance)

const server = require("http").createServer(app)
const options = {cors: {origin: "*"}}
const io = require("socket.io")(server, options);
io.on("connection", (socket) => {
    console.log("we're one, brother")
    Bowl.count().then(bowl => {
        io.emit('bowlcount', bowl)
    })
});
server.listen(PORT,()=>{
    console.log(`listening at http://localhost:${PORT} 🚀`)
})

const sequelize = require('./db/connection')
const Op = sequelize.Op 
const moment = require("moment")
const {Server} = require('./db/models')
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
    Server.create({id: guild.id, name: guild.name }).then(res=>{console.log(res)})
});

//on someone leaving voice channel (to check if keef is alone)

client.on("message", message => {
    
    if (message.channel.type == "dm") {
        console.log('dm')
        return;
    }

    Server.findOrCreate({where: {id: message.guild.id}, defaults: {id: message.guild.id, name: message.guild.name}}).then(serv => { //returns an array. find just one?
        var serverName = serv[0].dataValues.name
        var serverId = serv[0].dataValues.id
        var prefix = serv[0].dataValues.prefix.toLowerCase()//when storing prefix, make sure to trim.
        var userVoiceChannel = message.member.voice.channel
        var msg = message.content.toLowerCase().trim()//NOTE: message changes to remove prefix down below
        if (!msg.startsWith(prefix + " ")) {
            return
        } else {
            msg = message.content.toLowerCase().replace(prefix, "").trim()
        }
        
        if (msg === "help") {//TODO: help command
            console.log('help')
        }

        if (userVoiceChannel && !isNaN(msg)) {
            if (msg < 0.1) {
                message.channel.send({content:"woah slow down buddy"})
                return
            }
            if (msg > 1440) {
                message.channel.send({content:"sorry bud i have work in the morning"})
                return
            }
            if (msg == 420) {
                message.channel.send({content:"ayyy lmao"})
            }
            message.channel.send({content:`schmoke a bowl every ${msg} min`})
            clearInterval(sesh.get(serverId))
            userVoiceChannel.join().then(connection =>{
                var botVoiceChannel = message.guild.me.voice.channel
                sesh.set(serverId,setInterval(() => {
                    if (botVoiceChannel && userVoiceChannel.members.size <= 1) {//NOTE: just a safety measure. Kicks keef out upon next bowl if nobody else is there
                        message.channel.send({content:"bruh where'd everyone go"})
                        clearInterval(sesh.get(serverId))
                        sesh.delete(serverId)
                        botVoiceChannel.leave();
                    } else {
                        connection.play('./audio/schmoke_a_bowl.mp3');
                        Server.findByPk(serverId).then(serv => {//TODO: better way to hold onto server, as you found it earlier?
                            serv.createBowl().then(() => {
                                Bowl.count().then(bowl => {
                                    io.emit('bowlcount', bowl)
                                })
                            })
                        })
                    }
                }, msg * 1000 * 60))
            }).catch(err => console.log(err));
        }

        if (msg === "stop") {//TODO glitches/crashes if nobody in call
            var botVoiceChannel = message.guild.me.voice.channel
            message.channel.send({content:"okay :3"})
            clearInterval(sesh.get(serverId))
            sesh.delete(serverId)
            botVoiceChannel.leave()
        }
        //now(optional)
        //freestyle(optional) has same requirements as above
        //keef * returns 'huh?'

        //keef leaves channel if nobody in it (also makes sure interval gets cleared) - or any 'schmoke a bowl' that happens with nobody else in call does not count as a bowl

        if (msg === "stats") {//TODO: rework this so it looks better. maybe a graph
            Bowl.count({where: {serverId: serverId}}).then(bowl => { //TODO better formatting?
                message.channel.send({content:"you've schmoked a total of " + bowl + " bowls:"})
            })
            Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'years').toDate()}}}).then(bowl => {
                message.channel.send({content:bowl + " bowls in the past year"})
            })
            Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'months').toDate()}}}).then(bowl => {
                message.channel.send({content:bowl + " bowls in the past month"})
            })
            Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'weeks').toDate()}}}).then(bowl => {
                message.channel.send({content:bowl + " bowls in the past week"})
            })
            Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'days').toDate()}}}).then(bowl => {
                message.channel.send({content:bowl + " bowls in the past day"})
            })
            Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'hours').toDate()}}}).then(bowl => {//TODO why does the last one always take forever? its only because this is the 6th. it can do 5 without issue
                message.channel.send({content:bowl + " bowls in the past hour"})
            })
        }
        if (message.content == prefix + " " + "server list") {//TODO only for testing. remove eventually
            message.channel.send({content:client.guilds.cache.map(g => g.name).join('\n')})
        }
    })
})

client.login(token);

sequelize.sync({
// force: true
}).then((res) => {
    // console.log(res)
}).catch((err) => {
    console.log(err)
})