const Sequelize = require('sequelize')
require('dotenv').config()
let sequelize

if (process.env.JAWSDB_URL) {
    sequelize = new Sequelize(process.env.JAWSDB_URL, {
        pool: {
          max: 50,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      })
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