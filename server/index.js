require("dotenv").config();
require("./log");

const web = require("./web");
const bot = require("./bot");

const dev = process.argv.includes("--web-only");

web.listen(dev ? "https://bowlbot.io" : "");
if (!dev) bot.start();
