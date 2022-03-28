// require("dotenv").config();
const server = require("http").createServer()
// const { sensitiveHeaders } = require("http2");//TODO: is this used?
const options = {cors: {origin: "*"}}
const io = require("socket.io")(server, options);
// var refresh
io.on("connection", () => {
    console.log("we're one, brother")
            Bowl.count({logging: false}).then(bowl => {
            io.emit('bowlcount', bowl)
        })
    // setInterval(() => {
    //     console.log("refreshing")
    //     Bowl.count({logging: false}).then(bowl => {
    //         io.emit('bowlcount', bowl)
    //     })
    // }, 1000)
});
io.on('disconnect', () => {
    clearInterval(refresh)
})
server.listen(process.env.PORT || 3000);

const sequelize = require('./db/connection')
const Op = sequelize.Op 
const moment = require("moment")
const {ServerStats} = require('./db/models')
const {Bowl} = require('./db/models')

sequelize.sync({
// force: true
}).then((res) => {
    // console.log(res)
}).catch((err) => {
    console.log(err)
})