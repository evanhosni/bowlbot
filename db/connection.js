const Sequelize = require('sequelize')
require('dotenv').config()
let sequelize

if (process.env.DATABASE_URL) {
    sequelize = new Sequelize(process.env.DATABASE_URL)
} else {
    sequelize = new Sequelize(
        process.env.DB_NAME,
        process.env.DB_USER,
        process.env.DB_PW,
        {
            dialect: 'mysql',
            host: 'localhost',
            // port: 3306
        }
    )
}

module.exports = sequelize