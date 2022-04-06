const Discord = require("discord.js");
require("dotenv").config();
// const { sensitiveHeaders } = require("http2");//TODO: is this used?

//NEW SERVER STUFF (EXPRESS)
const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000
// app.use(express.urlencoded({extended:true})) //TODO: what does this do?
// app.use(express.json()) //TODO: what does this do?
app.get('/', (req, res) =>
res.sendFile(path.join(__dirname, '/index.html'))
);
// https://console.cron-job.org/jobs (for ping scheduling maintenance)

const server = require("http").createServer(app)
const options = {cors: {origin: "*"}} //TODO: only allow from specific url or set methods to GET only
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

const client = new Discord.Client();

client.on("ready", () => {
    console.log(`ayyooo it's ${client.user.tag}`);
    console.log(client.guilds.cache.map(g => g.name).join('\n'))
});

client.on("guildCreate", guild => {
    //TODO: welcome message
    Server.create({id: guild.id, name: guild.name }).then(res=>{console.log(res)})
});

client.on("message", message => {

    var prefix = "keef"
    var msg = message.content.toLowerCase().trim()
    
    if (message.channel.type == "dm") { //ignores direct messages
        // console.log(message)
        // message.channel.send({content:"sup baby"})
        return;
    }

    if (!msg.startsWith(prefix + " ")) { //ignores messages that don't start with prefix
        return
    } else {
        msg = message.content.toLowerCase().replace(prefix, "").trim()
    }

    Server.findOrCreate({where: {id: message.guild.id}, defaults: {id: message.guild.id, name: message.guild.name}}).then(serv => { //returns an array. find just one?

        var serverName = serv[0].dataValues.name
        var serverId = serv[0].dataValues.id
        var userVoiceChannel = message.member.voice.channel

        if (msg === "help" || msg === "commands") { //TODO: help command
            console.log('help')
            return
        }

        if (!isNaN(msg)) {

            if (!userVoiceChannel) {
                message.channel.send({content:"it's no sesh without u, " + message.author.toString() + " <3"}) //TODO: ask the boys. should i tag users or just say "buddy"?
                return
            }

            if (msg < 1) {
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
            return
        }

        //TODO: "keef when" - tells users time remaining until next rip
        //TODO: "keef freestyle" - random intervals between 0 and 10 min (maybe users can set range) (maybe reggae playing quietly in background)
        //TODO: reggae music upon entry? Optional feature that can be turned on/off per server settings

        //TODO: "keef enable/disable ranking" to toggle ranked boolean
        //TODO: when servers kick keef, set their server to ranked = false

        //TODO: monthly awards (like The Platinum Lung). "keef awards" shows all your awards. permanent on leaderboards history

        if (msg === "stop") { //ends sesh
            var botVoiceChannel = message.guild.me.voice.channel
            if (botVoiceChannel) {
                message.channel.send({content:"okay :3"})
                clearInterval(sesh.get(serverId))
                sesh.delete(serverId)
                botVoiceChannel.leave()
            } else {
                message.channel.send({content:"i wasn't doing anything!"})
            }
            return
        }

        if (msg === "stats") {//TODO: rework this so it looks better. maybe a graph
            Bowl.count({where: {serverId: serverId}}).then(bowl => {
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
            return
        }

        message.channel.send({content:"huh?"}) //all unknown commands return "huh?" //TODO: array ["huh?","what?","hmm?"]

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