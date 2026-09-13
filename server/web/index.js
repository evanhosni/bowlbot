const express = require("express");
const path = require("path");
const http = require("http");

const CLIENT_DIR = path.join(__dirname, "..", "..", "client");

const app = express();
app.use(express.static(CLIENT_DIR));
app.get("/", (req, res) => res.sendFile(path.join(CLIENT_DIR, "index.html")));

const server = http.createServer(app);
const io = require("socket.io")(server, { cors: { origin: "*" } }); //TODO: only allow from specific url or set methods to GET only

require("./socket").attach(io);

function listen() {
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`listening at http://localhost:${PORT} 🚀`);
  });
}

module.exports = { app, server, io, listen };
