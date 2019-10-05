const Market = require('../models/Market')
const markets = require('./data/markets.json')

const LoanMarket = require('../models/LoanMarket')
const loanMarkets = require('./data/loanMarkets.json')

const { migrate } = require('./migrate')

async function main () {
  await migrate()

  process.exit()
}

main()
