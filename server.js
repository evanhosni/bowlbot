const Discord = require("discord.js");
const discordVoice = require("@discordjs/voice");
require("dotenv").config();
// const { sensitiveHeaders } = require("http2");//TODO: is this used?

//NEW SERVER STUFF (EXPRESS)
const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
// app.use(express.urlencoded({extended:true})) //TODO: what does this do?
// app.use(express.json()) //TODO: what does this do?
app.use(express.static(__dirname));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "/index.html")));

const sequelize = require("./db/connection");
const Op = sequelize.Op;
const moment = require("moment");
const { Server } = require("./db/models");
const { Bowl } = require("./db/models");

const server = require("http").createServer(app);
const options = { cors: { origin: "*" } }; //TODO: only allow from specific url or set methods to GET only
const io = require("socket.io")(server, options);
server.listen(PORT, () => {
  console.log(`listening at http://localhost:${PORT} 🚀`);
});

const disclaimer =
  "**BOWLBOT DISCLAIMER / WAIVER:**\n\nBowlbot is for cannabis patients and adults only. Bowlbot was created to help users pace themselves, not to promote excessive consumption. Please use bowlbot responsibly.\nThe creators of bowlbot are not responsible for any damage or misconduct related to the use/misuse of bowlbot or marijuana.\nWarning: Marijuana can impair concentration, coordination, and judgment. Do not operate a vehicle or machinery under the influence of this drug. This drug has intoxicating effects and may be habit forming. There may be health risks associated with consumption of this drug. For use only by adults twenty-one and older. Keep out of the reach of anyone under the age of 21 and pets.\n\n**By using bowlbot, you agree to the following:**\n- You are at least 21 years of age\n- You are abiding by your state and federal cannabis laws.\n- You understand the effects of marijuana.\n- You are using bowlbot at your own risk, including all risks of injury and/or damage.\n- You assume all responsibility for your health, body, and actions whilst under the influence of marijuana.\n- You waive the right to make, assist, or cause any claims of any kind against bowlbot and its creators for your actions and the actions of your peers and fellow server members.\n- You will defend, indemnify, and hold bowlbot and its creators harmless against all claims, demands, liabilities, damages, losses, costs, fees (including legal fees), and expenses which may be asserted against bowlbot or its creators relating to any claim or legal proceeding arising from the use/misuse of bowlbot.\n- You have read this disclaimer/waiver and understand it in its entirety.\n\n**By using bowlbot, you agree to these terms.**\n\nhttps://bowlbot.app";

//DISCORD STUFF----------------------------------------------------------------------------------------

const bot = new Discord.Client({
  intents: [
    //TODO: which intents do i need?
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMessages,
    Discord.GatewayIntentBits.GuildPresences,
    Discord.GatewayIntentBits.GuildVoiceStates,
  ],
});

let sesh = new Map();
let leaderboardsMap = new Map();
let is_online = false;

function vibeCheck(clients) {
  Server.findAll({ where: { rank: true } }).then((servers) => {
    for (let i = 0; i < servers.length; i++) {
      if (!clients.includes(servers[i].id)) {
        Server.findByPk(servers[i].id).then((serv) => {
          serv.update({ rank: false });
        });
      }

      var total = Bowl.count({ where: { serverId: servers[i].id } });
      var year = Bowl.count({
        where: { serverId: servers[i].id, schmokedAt: { [Op.gte]: moment().subtract(1, "years").toDate() } },
      });
      var month = Bowl.count({
        where: { serverId: servers[i].id, schmokedAt: { [Op.gte]: moment().subtract(1, "months").toDate() } },
      });
      var week = Bowl.count({
        where: { serverId: servers[i].id, schmokedAt: { [Op.gte]: moment().subtract(1, "weeks").toDate() } },
      });
      var day = Bowl.count({
        where: { serverId: servers[i].id, schmokedAt: { [Op.gte]: moment().subtract(1, "days").toDate() } },
      });
      var hour = Bowl.count({
        where: { serverId: servers[i].id, schmokedAt: { [Op.gte]: moment().subtract(1, "hours").toDate() } },
      });

      Promise.all([total, year, month, week, day, hour]).then((data) => {
        leaderboardsMap.set(servers[i].id, [servers[i].name, data[0], data[1], data[2], data[3], data[4], data[5]]);
      });
    }
  });
}

bot.on("ready", () => {
  console.log(`ayyooo it's ${bot.user.tag}`);
  console.log(bot.guilds.cache.map((g) => g.name).join("\n"));
  is_online = true;
  io.emit("bot_status", is_online);
  var clientIds = bot.guilds.cache.map((g) => g.id);
  Promise.all(clientIds).then((data) => {
    vibeCheck(data);
  });
});

bot.on("guildCreate", (guild) => {
  guild.systemChannel.send(
    "*cough cough* ayyooo it's keef!!\n\ntype `@keef help` for the list of commands, or we could jump right into a 30-min schmoke interval with `@keef 30`\n\n**IMPORTANT: Use bowlbot (me) at your own risk. By using bowlbot, you agree to the bowlbot disclaimer/waiver.**"
  );
  guild.systemChannel.send("@everyone\n\n" + disclaimer);
  Server.findOrCreate({ where: { id: guild.id }, defaults: { id: guild.id, name: guild.name } }).then((res) => {
    console.log(res);
  });
});

bot.on("messageCreate", (message) => {
  var msg;
  var ukMode = false;

  // if (message.channel.type == "dm" && !message.author.bot) { //ignores direct messages
  //     message.channel.send({content:"sup baby"}) //TODO: spams pierce for some reason. do something else?
  //     return;
  // }

  if (message.author.bot) return;
  if (message.mentions.here) return;
  if (message.mentions.everyone) return;
  if (!message.mentions.has(bot.user)) return;

  if (message.mentions.has(bot.user)) {
    msg = message.content.toLowerCase().replace(`<@${bot.user.id}>`, "").trim();
  }

  if (msg == "") {
    message.channel.send({ content: "sup?" });
    return;
  }

  if (msg.endsWith("bruv")) {
    ukMode = true;
    msg = msg.replace("bruv", "").trim();
  }

  Server.findOrCreate({
    where: { id: message.guild.id },
    defaults: { id: message.guild.id, name: message.guild.name },
  }).then((serv) => {
    //returns an array. find just one?

    var serverId = serv[0].dataValues.id;
    var userVoiceChannel = message.member.voice.channel; //TODO: add variable for message.guild too

    if (serv[0].dataValues.name !== message.guild.name) {
      serv[0].update({ name: message.guild.name }).then((serv) => {
        if (leaderboardsMap.get(serv.id)) {
          leaderboardsMap.set(serv.id, [serv.name, ...leaderboardsMap.get(serv.id).slice(1)]);
        }
      });
    }

    if (msg === "help" || msg === "commands") {
      //displays list of commands
      message.channel.send({
        content:
          "here are my commands:\n`@keef help` - opens this command list (how meta)\n`@keef [number]` - sets a schmoke interval for [number] minutes\n`@keef stop` - stops the interval and kicks me from the call\n`@keef stats` - displays your server's schmokin' stats\n`@keef enable/disable rank` - enables/disables showing your server's name on website leaderboards (admins only)\n`@keef website` - displays website url in a fancy clickable link\n`@keef support` - displays an invite link to my support server\n`@keef disclaimer` - displays the bowlbot disclaimer/waiver",
      });
      return;
    }

    if (!isNaN(msg)) {
      if (!userVoiceChannel) {
        message.channel.send({
          content: "it's no sesh without u, " + (ukMode ? "bruv" : message.author.toString()) + " <3",
        });
        return;
      }

      if (msg < 1) {
        message.channel.send({ content: "woah slow down " + (ukMode ? "bruv" : "buddy") });
        return;
      }
      if (msg > 1440) {
        message.channel.send({ content: "sorry " + (ukMode ? "bruv" : "bud") + " i have work in the morning" });
        return;
      }
      if (msg == 420) {
        message.channel.send({ content: "ayyy lmao" });
      }
      message.channel.send({ content: `schmoke a ` + (ukMode ? "spliff" : "bowl") + ` every ${msg} min` });
      clearInterval(sesh.get(serverId));

      const player = discordVoice.createAudioPlayer();
      const connection = discordVoice.joinVoiceChannel({
        channelId: userVoiceChannel.id,
        guildId: message.guild.id,
        adapterCreator: message.guild.voiceAdapterCreator,
        selfDeaf: false,
      });
      connection.subscribe(player);

      var botVoiceChannel = discordVoice.getVoiceConnection(message.guild.id);
      sesh.set(
        serverId,
        setInterval(() => {
          if (botVoiceChannel && userVoiceChannel.members.size <= 1) {
            //NOTE: just a safety measure. Kicks keef out upon next bowl if nobody else is there
            message.channel.send({ content: "bru" + (ukMode ? "v" : "h") + " where'd everyone go" });
            clearInterval(sesh.get(serverId));
            sesh.delete(serverId);
            botVoiceChannel.destroy();
          } else {
            player.play(
              discordVoice.createAudioResource(ukMode ? "./audio/schmoke_a_spliff.mp3" : "./audio/schmoke_a_bowl.mp3")
            );
            Server.findByPk(serverId).then((serv) => {
              //TODO: better way to hold onto server, as you found it earlier?
              serv.createBowl().then(() => {
                Bowl.count().then((bowl) => {
                  var total = Bowl.count({ where: { serverId: serverId } });
                  var year = Bowl.count({
                    where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "years").toDate() } },
                  });
                  var month = Bowl.count({
                    where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "months").toDate() } },
                  });
                  var week = Bowl.count({
                    where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "weeks").toDate() } },
                  });
                  var day = Bowl.count({
                    where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "days").toDate() } },
                  });
                  var hour = Bowl.count({
                    where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "hours").toDate() } },
                  });

                  Promise.all([total, year, month, week, day, hour])
                    .then((data) => {
                      if (serv.rank) {
                        leaderboardsMap.set(serverId, [
                          serv.name,
                          data[0],
                          data[1],
                          data[2],
                          data[3],
                          data[4],
                          data[5],
                        ]);
                      } else {
                        leaderboardsMap.delete(serverId);
                      }
                    })
                    .then(() => {
                      io.emit("bowlcount", bowl);
                    });
                });
              });
            });
          }
        }, msg * 1000 * 60)
      );
      return;
    }

    //TODO: "keef when" - tells users time remaining until next rip
    //TODO: "keef freestyle" - random intervals between 0 and 10 min (maybe users can set range) (maybe reggae playing quietly in background)
    //TODO: coughing + reggae music upon entry? Optional feature that can be turned on/off per server settings
    //TODO: monthly awards (like The Platinum Lung). "keef awards" shows all your awards. permanent on leaderboards history

    if (msg === "stop") {
      //ends sesh //TODO: do you want to be able to stop keef if other people are in the call but you are not?
      var botVoiceChannel = discordVoice.getVoiceConnection(message.guild.id);
      if (botVoiceChannel) {
        message.channel.send({ content: "okay :3" });
        clearInterval(sesh.get(serverId));
        sesh.delete(serverId);
        botVoiceChannel.destroy();
      } else {
        message.channel.send({ content: "i wasn't doing anything!" });
      }
      return;
    }

    if (msg === "stats") {
      //displays server stats via message //TODO: better formatting? maybe table
      var total = Bowl.count({ where: { serverId: serverId } });
      var year = Bowl.count({
        where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "years").toDate() } },
      });
      var month = Bowl.count({
        where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "months").toDate() } },
      });
      var week = Bowl.count({
        where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "weeks").toDate() } },
      });
      var day = Bowl.count({
        where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "days").toDate() } },
      });
      var hour = Bowl.count({
        where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "hours").toDate() } },
      });

      Promise.all([total, year, month, week, day, hour]).then((data) => {
        //TODO: emojis based on amount of bowls
        message.channel.send({
          content:
            "you've schmoked a total of " +
            data[0] +
            " bowls\n- - - - - - - - - - - - - - - - - - - - - -\n" +
            data[1] +
            " bowls in the past year\n" +
            data[2] +
            " bowls in the past month\n" +
            data[3] +
            " bowls in the past week\n" +
            data[4] +
            " bowls in the past day\n" +
            data[5] +
            " bowls in the past hour\n- - - - - - - - - - - - - - - - - - - - - -\nkeep up the great work!",
        });
      });
      return;
    }

    if (msg === "website" || msg === "leaderboards" || msg === "leaderboard") {
      message.channel.send({ content: "https://bowlbot.app" });
      return;
    }

    if (msg === "support") {
      message.channel.send({ content: "https://discord.gg/CzmtRZa9Zd" });
      return;
    }

    if (msg === "disclaimer" || msg === "waiver") {
      message.channel.send({ content: disclaimer });
      return;
    }

    if (msg === "enable rank" || msg === "enable ranked" || msg === "enable ranking") {
      Server.findByPk(serverId).then((serv) => {
        if (!serv.rank) {
          if (message.member.permissions.has(Discord.PermissionFlagsBits.Administrator)) {
            serv.update({ rank: true });
            message.channel.send({
              content:
                "ranking enabled. your server's name and schmokin' stats will now appear on the leaderboards at https://bowlbot.app",
            });

            var total = Bowl.count({ where: { serverId: serverId } });
            var year = Bowl.count({
              where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "years").toDate() } },
            });
            var month = Bowl.count({
              where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "months").toDate() } },
            });
            var week = Bowl.count({
              where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "weeks").toDate() } },
            });
            var day = Bowl.count({
              where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "days").toDate() } },
            });
            var hour = Bowl.count({
              where: { serverId: serverId, schmokedAt: { [Op.gte]: moment().subtract(1, "hours").toDate() } },
            });
            Promise.all([total, year, month, week, day, hour]).then((data) => {
              leaderboardsMap.set(serverId, [serv.name, data[0], data[1], data[2], data[3], data[4], data[5]]);
            });
          } else {
            message.channel.send({ content: "you don't have this permission. get your server admin to do it." });
          }
        } else {
          message.channel.send({ content: "ranking is already enabled." });
        }
      });
      return;
    }

    if (msg === "disable rank" || msg === "disable ranked" || msg === "disable ranking") {
      Server.findByPk(serverId).then((serv) => {
        if (serv.rank) {
          if (message.member.permissions.has(Discord.PermissionFlagsBits.Administrator)) {
            serv.update({ rank: false });
            message.channel.send({
              content:
                "ranking disabled. your server's name and schmokin' stats will no longer appear on the leaderboards at https://bowlbot.app",
            });
            leaderboardsMap.delete(serverId);
          } else {
            message.channel.send({ content: "you don't have this permission. get your server admin to do it." });
          }
        } else {
          message.channel.send({ content: "ranking is already disabled." });
        }
      });
      return;
    }

    // if (msg === "check rank" || msg === "check ranked" || msg === "check ranking") { //TODO: maybe check actual rank, like 1st place, etc.?
    //     Server.findByPk(serverId).then(serv => {
    //         if (serv.rank) {
    //             message.channel.send({content:"rank is currently enabled."})
    //         } else {
    //             message.channel.send({content:"rank is currently disabled."})
    //         }
    //     })
    //     return
    // }

    if (msg === "number" || msg === "(number)" || msg === "[number]") {
      message.channel.send({ content: "no not like that silly goose. actually specify a number... like `keef 15`" }); //TODO: rephrase?
      return;
    }

    if (msg === "server list") {
      console.log("CONNECTED CLIENTS:");
      console.log("(" + bot.guilds.cache.size + ")");
      console.log(bot.guilds.cache.map((g) => [g.name, g.id]));
      console.log("LEADERBOARDS MAP:");
      console.log(leaderboardsMap);
      console.log("SESH MAP:");
      console.log(sesh);
    }

    message.channel.send({ content: "huh?" }); //all unknown commands return "huh?" //TODO: array ["huh?","what?","hmm?"]? TODO: after 3rd huh in a row offer 'keef help'?
  });
});

bot.on("error", (error) => {
  console.log("bot error:", error);
  is_online = false;
  io.emit("bot_status", is_online);
});

bot.on("disconnect", () => {
  console.log("bot disconnected");
  is_online = false;
  io.emit("bot_status", is_online);
});

bot.login(process.env.token);

//SOCKETIO STUFF----------------------------------------------------------------------------------------

io.on("connection", (socket) => {
  console.log("we're one, brother");
  socket.emit("bot_status", is_online);
  Bowl.count().then((bowl) => {
    io.emit("init", bowl);
  });
  socket.on("leaderboards", () => {
    //TODO: to prevent leaderboards not showing up glitch, await leaderboardsMap before grabbing below data from it...?
    var totalSorted = Array.from(leaderboardsMap)
      .sort((a, b) => {
        return b[1][1] - a[1][1];
      })
      .map(([id, data]) => {
        name = data[0];
        bowls = data[1];
        return { name, bowls };
      });
    var yearSorted = Array.from(leaderboardsMap)
      .sort((a, b) => {
        return b[1][2] - a[1][2] || b[1][1] - a[1][1];
      })
      .map(([id, data]) => {
        name = data[0];
        bowls = data[2];
        return { name, bowls };
      });
    var monthSorted = Array.from(leaderboardsMap)
      .sort((a, b) => {
        return b[1][3] - a[1][3] || b[1][2] - a[1][2] || b[1][1] - a[1][1];
      })
      .map(([id, data]) => {
        name = data[0];
        bowls = data[3];
        return { name, bowls };
      });
    var weekSorted = Array.from(leaderboardsMap)
      .sort((a, b) => {
        return b[1][4] - a[1][4] || b[1][3] - a[1][3] || b[1][2] - a[1][2] || b[1][1] - a[1][1];
      })
      .map(([id, data]) => {
        name = data[0];
        bowls = data[4];
        return { name, bowls };
      });
    var daySorted = Array.from(leaderboardsMap)
      .sort((a, b) => {
        return b[1][5] - a[1][5] || b[1][4] - a[1][4] || b[1][3] - a[1][3] || b[1][2] - a[1][2] || b[1][1] - a[1][1];
      })
      .map(([id, data]) => {
        name = data[0];
        bowls = data[5];
        return { name, bowls };
      });
    var hourSorted = Array.from(leaderboardsMap)
      .sort((a, b) => {
        return (
          b[1][6] - a[1][6] ||
          b[1][5] - a[1][5] ||
          b[1][4] - a[1][4] ||
          b[1][3] - a[1][3] ||
          b[1][2] - a[1][2] ||
          b[1][1] - a[1][1]
        );
      })
      .map(([id, data]) => {
        name = data[0];
        bowls = data[6];
        return { name, bowls };
      });

    Promise.all([totalSorted, yearSorted, monthSorted, weekSorted, daySorted, hourSorted]).then((data) => {
      socket.emit("leaderboards", [data[0], data[1], data[2], data[3], data[4], data[5]]);
    });
  });
});

sequelize
  .sync({
    // /*force: true*/
  })
  .then((res) => {
    // console.log(res)
  })
  .catch((err) => {
    console.log(err);
  });

//TODO: auto set rank to false if server kicks keef
//TODO: 61 bowls per hour on leaderboard?
