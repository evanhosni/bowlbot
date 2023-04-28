const Sequelize = require("sequelize")
const sequelize = require('./connection')

// const Server = sequelize.define("server", {
//     id: {
//         type: Sequelize.BIGINT,
//         allowNull: false,
//         primaryKey: true
//     },
//     name: {
//         type: Sequelize.STRING,
//         allowNull: false
//     },
//     rank: {
//         type: Sequelize.BOOLEAN,
//         defaultValue: false
//     }
// })

// const Bowl = sequelize.define("bowl", {})

// Server.hasMany(Bowl)

// module.exports = {Server, Bowl}

const Bowls = sequelize.define("bowls", {
    // id: {
    //     type: Sequelize.STRING,
    //     allowNull: false,
    //     primaryKey: true,
    //     defaultValue: "total"
    // },
    // total: {
    //     type: Sequelize.BIGINT,
    //     allowNull: false
    // }
})

module.exports = {Bowls}