// dotenv must load before the db module opens DATABASE_PATH.
require("dotenv").config();
require("./log");

const web = require("./web");
const bot = require("./bot");

web.listen();
bot.start();
