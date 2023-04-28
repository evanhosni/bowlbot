const Sequelize = require('sequelize')
require('dotenv').config()
let sequelize


sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PW,
    {
        dialect: 'mysql',
        host: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`,
        dialectOptions: {
            socketPath: `/cloudsql/${process.env.CLOUD_SQL_CONNECTION_NAME}`
        },
    }
)

// // For connecting to local db
// sequelize = new Sequelize(
//     process.env.DB_NAME,
//     process.env.DB_USER,
//     process.env.DB_PW,
//     {
//         dialect: 'mysql',
//         host: 'localhost',
//     }
// )

module.exports = sequelize