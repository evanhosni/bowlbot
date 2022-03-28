const server = require("http").createServer()
const options = {cors: {origin: "*"}}//TODO: change to only deployed link when website is done
const io = require("socket.io")(server, options);
var bowls

io.on("connection", () => {
    console.log("we're one, brother")
    // setInterval(() => {
    //     io.emit('bowlcount', bowls)
    // }, 100)
    socket.on("doit", bowls => {
        console.log(bowls)
    })
});
server.listen(process.env.PORT || 3000);

const sequelize = require('./db/connection')
const Op = sequelize.Op 
const moment = require("moment")
const {ServerStats} = require('./db/models')
const {Bowl} = require('./db/models')

// refresh("default")
function refresh() {
    Bowl.count({logging: false}).then(bowl => {//TODO: logging false doing anything?
        bowls = bowl
        console.log(bowls)
        io.emit('doit', bowls)
    })
}

sequelize.sync({
// force: true
}).then((res) => {
    // console.log(res)
}).catch((err) => {
    console.log(err)
})

module.exports = refresh