const Discord = require("discord.js");
const { sensitiveHeaders } = require("http2");//TODO: is this used?

// const SequelizeStore = require('connect-session-sequelize')(session.Store)
const sequelize = require('./db/connection')
const ServerStats = require('./db/ServerStats')
//TODO add bowls as separate table? that way u can use dates for stats

require("dotenv").config();

const token = process.env.token;
var prefix = "keef"
var sesh

const client = new Discord.Client();

client.on("ready", () => {
    console.log(`ayyooo it's ${client.user.tag}`);
    console.log(client.guilds.cache.map(g => g.name).join('\n'))
});

client.on("guildCreate", guild => {
    // guild.owner.send('Thanks! You can use +help to discover commands.')
    console.log(guild.id)
    console.log(guild.name)
    ServerStats.create({id: guild.id, serverName: guild.name }).then(res=>{console.log(res)})
});

client.on("message", message => {
    var voiceChannel = message.member.voice.channel;
    if (message.content.match(new RegExp(prefix + " " + "[0-9]")) && message.member.voice.channel) {//TODO regex for unknown amount of spaces?
        var time = message.content.split(" ")[1]
        if (time < 1) {
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
        ServerStats.findByPk(message.guild.id).then(res => {
            message.channel.send({content:"you've schmoked " + res.dataValues.bowls + " bowls"})
        })
    }
})

client.login(token);

//add leaves on/off
// sequelize.sync({force:false}).then(function() {
//     app.listen(PORT, function() {
//         console.log(`App listening on http://localhost:${PORT}`)
//     })
// })

sequelize.sync({

}).then((res) => {
    console.log(res)
}).catch((err) => {
    console.log(err)
})