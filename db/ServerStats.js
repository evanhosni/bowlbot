const sequelize = require('./connection')
const {Model,DataTypes} = require('sequelize')

class ServerStats extends Model {}

ServerStats.init({
    id: {
        type: DataTypes.BIGINT,
        allowNull: false,
        primaryKey: true
    },
    serverName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    // dateJoined: {
    //     type: DataTypes.DATEONLY,
    //     allowNull: false
    // },
    bowls: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
},{
    // timestamp: true,
    sequelize
})

module.exports = ServerStats