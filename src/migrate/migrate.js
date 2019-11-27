const Market = require('../models/Market')
const markets = require('./data/markets.json')

const LoanMarket = require('../models/LoanMarket')
const loanMarkets = require('./data/loanMarkets.json')

const {
  database,
  status,
  up
} = require('@mblackmblack/migrate-mongo')

async function migrate () {
  const db = await database.connect()

  const migrated = await up(db)
  migrated.forEach(fileName => console.log('Migrated: ', fileName))
}

module.exports = {
  migrate
}
