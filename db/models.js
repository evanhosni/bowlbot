const Sequelize = require("sequelize")
const sequelize = require('./connection')

const Server = sequelize.define("server", {
    id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        primaryKey: true
    },
    name: {
        type: Sequelize.STRING,
        allowNull: false
    },
    prefix: {
        type: Sequelize.STRING,
        allowNull: false,
        defaultValue: 'keef'
    },
    public: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
    }
})

const Bowl = sequelize.define("bowl", {})

Server.hasMany(Bowl)

module.exports = {Server, Bowl}