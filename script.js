const sequelize = require('./db/connection')
const Op = sequelize.Op 
const moment = require("moment")
const {ServerStats} = require('./db/models')
const {Bowl} = require('./db/models')


var bowls = document.querySelector('#rips')

setInterval(() => {
    Bowl.count().then(bowl => {
        bowls.innerHTML = bowl
    })
}, 10 * 60)