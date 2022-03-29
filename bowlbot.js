const Discord = require("discord.js");
require("dotenv").config();
// const server = require("http").createServer()

const sequelize = require('./db/connection')
const Op = sequelize.Op 
const moment = require("moment")
const {ServerStats} = require('./db/models')
const {Bowl} = require('./db/models');
const refresh = require('./client')

const token = process.env.token;
var prefix = "keef"
var sesh

const client = new Discord.Client();

client.on("ready", () => {
    console.log(`ayyooo it's ${client.user.tag}`);
    (client.guilds.cache.map(g => g.id).join('\n'))
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

        clearInterval(sesh)
        voiceChannel.join().then(connection =>{
            sesh = setInterval(() => {
                connection.play('./audio/smoke_a_bowl.mp3');
                ServerStats.findByPk(message.guild.id).then(serv => {
                    serv.createBowl().then(() => {
                        // refresh()
                    })
                })
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
        refresh()
    }
    //     // Bowl.count().then(bowl => {
    //     //     message.channel.send({content:bowl + " bowls have been schmoked globally"})
    //     // })
    // }
})

client.login(token);

sequelize.sync({
// force: true
}).then((res) => {
    // console.log(res)
}).catch((err) => {
    console.log(err)
})