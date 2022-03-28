const server = require("http").createServer()
const options = {cors: {origin: "*"}}//TODO: change to only deployed link when website is done
const io = require("socket.io")(server, options);
io.on("connection", () => {
    console.log("we're one, brother")
    Bowl.count({logging: false}).then(bowl => {//TODO: logging false doing anything?
        io.emit('bowlcount', bowl)
    })
});
server.listen(process.env.PORT || 3000);

const sequelize = require('./db/connection')
const Op = sequelize.Op 
const moment = require("moment")
const {ServerStats} = require('./db/models')
const {Bowl} = require('./db/models')

bingus("default")
function bingus(bong) {
    console.log("chimp bingus " + bong)
}

sequelize.sync({
// force: true
}).then((res) => {
    // console.log(res)
}).catch((err) => {
    console.log(err)
})