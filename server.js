const Discord = require("discord.js");
const discordVoice = require("@discordjs/voice")
require("dotenv").config();
// const { sensitiveHeaders } = require("http2");//TODO: is this used?

//NEW SERVER STUFF (EXPRESS)
const express = require('express');
const path = require('path');
const app = express();
const PORT = parseInt(process.env.PORT) || 3000
// app.use(express.urlencoded({extended:true})) //TODO: what does this do?
// app.use(express.json()) //TODO: what does this do?
app.use(express.static(__dirname))
app.get('/', (req, res) =>
res.sendFile(path.join(__dirname, '/index.html'))
);

const sequelize = require('./db/connection')
const {Bowls} = require('./db/models')

const server = require("http").createServer(app)
const options = {cors: {origin: "*"}} //TODO: only allow from specific url or set methods to GET only
const io = require("socket.io")(server, options);
server.listen(PORT,()=>{
    console.log(`listening at http://localhost:${PORT} 🚀`)
})

const disclaimer = "**BOWLBOT DISCLAIMER / WAIVER:**\n\nBowlbot is for cannabis patients and adults only. Bowlbot was created to help users pace themselves, not to promote excessive consumption. Please use bowlbot responsibly.\nThe creators of bowlbot are not responsible for any damage or misconduct related to the use/misuse of bowlbot or marijuana.\nWarning: Marijuana can impair concentration, coordination, and judgment. Do not operate a vehicle or machinery under the influence of this drug. This drug has intoxicating effects and may be habit forming. There may be health risks associated with consumption of this drug. For use only by adults twenty-one and older. Keep out of the reach of anyone under the age of 21 and pets.\n\n**By using bowlbot, you agree to the following:**\n- You are at least 21 years of age\n- You are abiding by your state and federal cannabis laws.\n- You understand the effects of marijuana.\n- You are using bowlbot at your own risk, including all risks of injury and/or damage.\n- You assume all responsibility for your health, body, and actions whilst under the influence of marijuana.\n- You waive the right to make, assist, or cause any claims of any kind against bowlbot and its creators for your actions and the actions of your peers and fellow server members.\n- You will defend, indemnify, and hold bowlbot and its creators harmless against all claims, demands, liabilities, damages, losses, costs, fees (including legal fees), and expenses which may be asserted against bowlbot or its creators relating to any claim or legal proceeding arising from the use/misuse of bowlbot.\n- You have read this disclaimer/waiver and understand it in its entirety.\n\n**By using bowlbot, you agree to these terms.**\n\nhttps://bowlbot.app"

//DISCORD STUFF----------------------------------------------------------------------------------------

const bot = new Discord.Client({
    intents: [ //TODO: which intents do i need?
        Discord.Intents.FLAGS.GUILDS,
        Discord.Intents.FLAGS.GUILD_MESSAGES,
        Discord.Intents.FLAGS.GUILD_PRESENCES,
        Discord.Intents.FLAGS.GUILD_VOICE_STATES
    ]
});

let sesh = new Map()

bot.on("ready", () => {
    console.log(`ayyooo it's ${bot.user.tag}`);
    console.log(bot.guilds.cache.map(g => g.name).join('\n'))
});

bot.on("guildCreate", guild => {
    guild.systemChannel.send("*cough cough* ayyooo it's keef!!\n\ntype `@keef help` for the list of commands, or we could jump right into a 30-min schmoke interval with `@keef 30`\n\n**IMPORTANT: Use bowlbot (me) at your own risk. By using bowlbot, you agree to the bowlbot disclaimer/waiver.**")
    guild.systemChannel.send("@everyone\n\n" + disclaimer)
});

bot.on("messageCreate", message => {

    var msg
    var ukMode = false

    // if (message.channel.type == "dm" && !message.author.bot) { //ignores direct messages
    //     message.channel.send({content:"sup baby"}) //TODO: spams pierce for some reason. do something else?
    //     return;
    // }

    if (message.author.bot) return
    if (message.mentions.here) return
    if (message.mentions.everyone) return
    if (!message.mentions.has(bot.user)) return

    if (message.mentions.has(bot.user)) {
        msg = message.content.toLowerCase().replace(`<@${bot.user.id}>`, "").trim()
    }

    if (msg == "") {
        message.channel.send({content:"sup?"})
        return
    }

    if (msg.endsWith("bruv")) {
        ukMode = true
        msg = msg.replace("bruv", "").trim()
    }
    
    var serverId = message.guildId
    var userVoiceChannel = message.member.voice.channel //TODO: add variable for message.guild too

    if (msg === "help" || msg === "commands") { //displays list of commands
        message.channel.send({content:"here are my commands:\n`@keef help` - opens this command list (how meta)\n`@keef [number]` - sets a schmoke interval for [number] minutes\n`@keef stop` - stops the interval and kicks me from the call\n`@keef stats` - displays your server's schmokin' stats\n`@keef enable/disable rank` - enables/disables showing your server's name on website leaderboards (admins only)\n`@keef website` - displays website url in a fancy clickable link\n`@keef support` - displays an invite link to my support server\n`@keef disclaimer` - displays the bowlbot disclaimer/waiver"})
        return
    }

    if (!isNaN(msg)) {

        if (!userVoiceChannel) {
            message.channel.send({content:"it's no sesh without u, " + (ukMode ? "bruv" : message.author.toString()) + " <3"})
            return
        }

        if (msg < 1) {
            message.channel.send({content:"woah slow down " + (ukMode ? "bruv" : "buddy")})
            return
        }
        if (msg > 1440) {
            message.channel.send({content:"sorry " + (ukMode ? "bruv" : "bud") + " i have work in the morning"})
            return
        }
        if (msg == 420) {
            message.channel.send({content:"ayyy lmao"})
        }
        message.channel.send({content:`schmoke a ` + (ukMode ? "spliff" : "bowl") + ` every ${msg} min`})
        clearInterval(sesh.get(serverId))

        const player = discordVoice.createAudioPlayer()
        const connection = discordVoice.joinVoiceChannel({
            channelId: userVoiceChannel.id,
            guildId: message.guild.id,
            adapterCreator: message.guild.voiceAdapterCreator,
            selfDeaf: false,
        })
        connection.subscribe(player)

        var botVoiceChannel = discordVoice.getVoiceConnection(message.guild.id)
        sesh.set(serverId,setInterval(() => {
            if (botVoiceChannel && userVoiceChannel.members.size <= 1) {//NOTE: just a safety measure. Kicks keef out upon next bowl if nobody else is there
                message.channel.send({content:"bru" + (ukMode ? "v" : "h") + " where'd everyone go"})
                clearInterval(sesh.get(serverId))
                sesh.delete(serverId)
                botVoiceChannel.destroy();
            } else {
                player.play(discordVoice.createAudioResource(ukMode ? './audio/schmoke_a_spliff.mp3' : './audio/schmoke_a_bowl.mp3'));
                Bowls.create().then(res=>{console.log(res)}).then(() => {
                    Bowls.count().then(bowls => {
                        console.log(bowls)
                        io.emit('bowlcount', bowls)
                    })
                })
            }
        }, msg * 1000 * 60))
        return
    }

    //TODO: "keef when" - tells users time remaining until next rip
    //TODO: "keef freestyle" - random intervals between 0 and 10 min (maybe users can set range) (maybe reggae playing quietly in background)
    //TODO: coughing + reggae music upon entry? Optional feature that can be turned on/off per server settings
    //TODO: monthly awards (like The Platinum Lung). "keef awards" shows all your awards. permanent on leaderboards history

    if (msg === "stop") { //ends sesh //TODO: do you want to be able to stop keef if other people are in the call but you are not?
        var botVoiceChannel = discordVoice.getVoiceConnection(message.guild.id)
        if (botVoiceChannel) {
            message.channel.send({content:"okay :3"})
            clearInterval(sesh.get(serverId))
            sesh.delete(serverId)
            botVoiceChannel.destroy()
        } else {
            message.channel.send({content:"i wasn't doing anything!"})
        }
        return
    }

    if (msg === "stats") {
        Bowls.count().then(bowls => {
            message.channel.send({content:bowls + " bowls have been schmoked worldwide."})
        })
        return
    }
    
    if (msg === "website") {
        message.channel.send({content:"https://bowlbot.app"})
        return
    }
    
    if (msg === "support") {
        message.channel.send({content:"https://discord.gg/CzmtRZa9Zd"})
        return
    }

    if (msg === "disclaimer" || msg === "waiver") {
        message.channel.send({content:disclaimer})
        return
    }
    
    if (msg === "number" || msg === "(number)" || msg === "[number]") {
        message.channel.send({content:"no not like that silly goose. actually specify a number... like `keef 15`"})//TODO: rephrase?
        return
    }
    
    if (msg === "leaderboards" || msg === "leaderboard" || msg === "enable rank" || msg === "enable ranked" || msg === "enable ranking" || msg === "disable rank" || msg === "disable ranked" || msg === "disable ranking") {
        message.channel.send({content:"sorry, this feature is no longer available. server was too expensive :("})
        return
    }
    
    if (msg === "server list") {
        console.log("CONNECTED CLIENTS:")
        console.log("(" + bot.guilds.cache.size + ")")
        console.log(bot.guilds.cache.map(g => [g.name, g.id]))
        console.log("SESH MAP:")
        console.log(sesh)
    }

    message.channel.send({content:"huh?"}) //all unknown commands return "huh?" //TODO: array ["huh?","what?","hmm?"]? TODO: after 3rd huh in a row offer 'keef help'?

})

bot.login(process.env.TOKEN);



//SOCKETIO STUFF----------------------------------------------------------------------------------------

io.on("connection", (socket) => {
    console.log("we're one, brother")
    Bowls.count().then(bowls => {
        io.emit('bowlcount', bowls)
    })
});


sequelize.sync({
// /*force: true*/
}).then((res) => {
    // console.log(res)
}).catch((err) => {
    console.log(err)
})