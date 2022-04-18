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

const sequelize = require('./db/connection')
const Op = sequelize.Op 
const moment = require("moment")
const {Server} = require('./db/models')
const {Bowl} = require('./db/models')

const server = require("http").createServer(app)
const options = {cors: {origin: "*"}} //TODO: only allow from specific url or set methods to GET only
const io = require("socket.io")(server, options);
server.listen(PORT,()=>{
    console.log(`listening at http://localhost:${PORT} 🚀`)
})



//DISCORD STUFF----------------------------------------------------------------------------------------

const client = new Discord.Client();
const token = process.env.token;
let sesh = new Map()
let leaderboardsMap = new Map()

function vibeCheck(data) {
    Server.findAll().then(servs => {
    
        var idArray = []
        var connectedClients = data
    
        for (let i = 0; i < servs.length; i++) {
    
            idArray.push(servs[i].id)
    
            var total = Bowl.count({where: {serverId: servs[i].id}})
            var year = Bowl.count({where: {serverId: servs[i].id, createdAt: {[Op.gte]: moment().subtract(1, 'years').toDate()}}})
            var month = Bowl.count({where: {serverId: servs[i].id, createdAt: {[Op.gte]: moment().subtract(1, 'months').toDate()}}})
            var week = Bowl.count({where: {serverId: servs[i].id, createdAt: {[Op.gte]: moment().subtract(1, 'weeks').toDate()}}})
            var day = Bowl.count({where: {serverId: servs[i].id, createdAt: {[Op.gte]: moment().subtract(1, 'days').toDate()}}})
            var hour = Bowl.count({where: {serverId: servs[i].id, createdAt: {[Op.gte]: moment().subtract(1, 'hours').toDate()}}})
    
            Promise.all([total,year,month,week,day,hour]).then(data => {
                leaderboardsMap.set(servs[i].name,[data[0],data[1],data[2],data[3],data[4],data[5]])
            })
        }
    
        for (let i = 0; i < connectedClients.length; i++) {
            if (!idArray.includes(connectedClients[i])) {
                //TODO: set connectedClients[i] to ranked = false
                console.log('yooooooooooooooooooooooooooooooooooooooooooooooooooo', connectedClients[i])
            }
        }
    
    })
}

client.on("ready", () => {
    console.log(`ayyooo it's ${client.user.tag}`);
    console.log(client.guilds.cache.map(g => g.name).join('\n'))
    var connectedClients = client.guilds.cache.map(g => g.id)
    Promise.all(connectedClients).then(data=>{vibeCheck(data)})
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
        // message.channel.send({content:"sup baby"}) //TODO: spams pierce for some reason
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
                message.channel.send({content:"it's no sesh without u, " + message.author.toString() + " <3"})
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

                                    var total = Bowl.count({where: {serverId: serverId}})
                                    var year = Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'years').toDate()}}})
                                    var month = Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'months').toDate()}}})
                                    var week = Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'weeks').toDate()}}})
                                    var day = Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'days').toDate()}}})
                                    var hour = Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'hours').toDate()}}})
                    
                                    Promise.all([total,year,month,week,day,hour]).then(data => {
                                        leaderboardsMap.set(serv.name,[data[0],data[1],data[2],data[3],data[4],data[5]])
                                    }).then(()=>{
                                        io.emit('bowlcount', bowl)
                                    })
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
        //TODO: coughing + reggae music upon entry? Optional feature that can be turned on/off per server settings
        //TODO: monthly awards (like The Platinum Lung). "keef awards" shows all your awards. permanent on leaderboards history

        //TODO: "keef enable/disable ranking" to toggle ranked boolean

        if (msg === "stop") { //ends sesh //TODO: do you want to be able to stop keef if other people are in the call but you are not?
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

        if (msg === "stats") { //displays server stats via message //TODO: better formatting? maybe table
            var total = Bowl.count({where: {serverId: serverId}})
            var year = Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'years').toDate()}}})
            var month = Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'months').toDate()}}})
            var week = Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'weeks').toDate()}}})
            var day = Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'days').toDate()}}})
            var hour = Bowl.count({where: {serverId: serverId, createdAt: {[Op.gte]: moment().subtract(1, 'hours').toDate()}}})

            Promise.all([total,year,month,week,day,hour]).then(data => { //TODO: emojis based on amount of bowls
                message.channel.send({content:"you've schmoked a total of " + data[0] + " bowls\n----------------------\n" + data[1] + " bowls in the past year\n" + data[2] + " bowls in the past month\n" + data[3] + " bowls in the past week\n" + data[4] + " bowls in the past day\n" + data[5] + " bowls in the past hour\n----------------------\nkeep up the great work!"})
            })
            return
        }

        if (msg === "server list") {
            console.log(client.guilds.cache.map(g => [g.name, g.id]))
            console.log(sesh)
        }

        message.channel.send({content:"huh?"}) //all unknown commands return "huh?" //TODO: array ["huh?","what?","hmm?"]

    })
})

client.login(token);



//SOCKETIO STUFF----------------------------------------------------------------------------------------

io.on("connection", (socket) => {
    console.log("we're one, brother")
    Bowl.count().then(bowl => {
        io.emit('bowlcount', bowl)
    })
    socket.on('leaderboards', () => {
        var totalSorted = Array.from(leaderboardsMap).sort((a,b) => {
            return b[1][0] - a[1][0]
        }).map(([name,bowls])=>{
            bowls = bowls[0]
            return {name, bowls}
        })
        var yearSorted = Array.from(leaderboardsMap).sort((a,b) => {
            return b[1][1] - a[1][1] || b[1][0] - a[1][0]
        }).map(([name,bowls])=>{
            bowls = bowls[1]
            return {name, bowls}
        })
        var monthSorted = Array.from(leaderboardsMap).sort((a,b) => {
            return b[1][2] - a[1][2] || b[1][1] - a[1][1] || b[1][0] - a[1][0]
        }).map(([name,bowls])=>{
            bowls = bowls[2]
            return {name, bowls}
        })
        var weekSorted = Array.from(leaderboardsMap).sort((a,b) => {
            return b[1][3] - a[1][3] || b[1][2] - a[1][2] || b[1][1] - a[1][1] || b[1][0] - a[1][0]
        }).map(([name,bowls])=>{
            bowls = bowls[3]
            return {name, bowls}
        })
        var daySorted = Array.from(leaderboardsMap).sort((a,b) => {
            return b[1][4] - a[1][4] || b[1][3] - a[1][3] || b[1][2] - a[1][2] || b[1][1] - a[1][1] || b[1][0] - a[1][0]
        }).map(([name,bowls])=>{
            bowls = bowls[4]
            return {name, bowls}
        })
        var hourSorted = Array.from(leaderboardsMap).sort((a,b) => {
            return b[1][5] - a[1][5] || b[1][4] - a[1][4] || b[1][3] - a[1][3] || b[1][2] - a[1][2] || b[1][1] - a[1][1] || b[1][0] - a[1][0]
        }).map(([name,bowls])=>{
            bowls = bowls[5]
            return {name, bowls}
        })

        socket.emit("leaderboards",[totalSorted,yearSorted,monthSorted,weekSorted,daySorted,hourSorted])
    })
});


sequelize.sync({
// /*force: true*/
}).then((res) => {
    // console.log(res)
}).catch((err) => {
    console.log(err)
})