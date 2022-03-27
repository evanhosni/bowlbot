const Sequelize = require("sequelize")
const sequelize = require('./connection')

const ServerStats = sequelize.define("serverstats", {
    id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        primaryKey: true
    },
    serverName: {
        type: Sequelize.STRING,
        allowNull: false
    },
    public: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
    }
})

const Bowl = sequelize.define("bowl", {})

ServerStats.hasMany(Bowl)

module.exports = {ServerStats, Bowl}