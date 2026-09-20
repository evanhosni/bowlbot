require("dotenv").config();
require("./log");

const web = require("./web");
const bot = require("./bot");

web.listen();
bot.start();
