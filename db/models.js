const Sequelize = require("sequelize")
const sequelize = require('./connection')

const Server = sequelize.define("server", {
    id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false
    },
    rank: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
    }
}, {
    timestamps: false
})

const Bowl = sequelize.define("bowl", {
    id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    schmokedAt: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
        allowNull: false
    }
},{
    timestamps: false
})

Server.hasMany(Bowl)

module.exports = {Server, Bowl}