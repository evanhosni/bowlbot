const server = require("http").createServer()
const options = {cors: {origin: "*"}}//TODO: change to only deployed link when website is done
const io = require("socket.io")(server, options);
server.listen(process.env.PORT || 3000);

const sequelize = require('./db/connection')
const Op = sequelize.Op 
const moment = require("moment")
const {ServerStats} = require('./db/models')
const {Bowl} = require('./db/models')

io.on("connection", () => {
    console.log("we're one, brother")
    Bowl.count({logging: false}).then(bowl => {//TODO: logging false doing anything?
        io.emit("bowlcount", bowl)
    })
});

io.on("refresh", () => {
    console.log("refreshing")
    Bowl.count({logging: false}).then(bowl => {//TODO: logging false doing anything?
        io.emit("bowlcount", bowl)
    })
});

// function refresh() {
//     Bowl.count({logging: false}).then(bowl => {//TODO: logging false doing anything?
//         io.emit("bowlcount", bowl)//TODO doesn't work
//     })
// }

sequelize.sync({
}).then((res) => {
    // console.log(res)
}).catch((err) => {
    console.log(err)
})

module.exports = refresh