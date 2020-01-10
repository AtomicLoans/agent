const LoanMarket = require('../../../models/LoanMarket')
const Market = require('../../../models/Market')
const Email = require('../../../models/Email');
const EthAddress = require('../../../models/EthAddress');

async function getMarketModels (principal, collateral) {
  const loanMarket = await LoanMarket.findOne({ principal, collateral }).exec()
  if (!loanMarket) return console.log('Error: Loan Market not found')

  const market = await Market.findOne({ from: collateral, to: principal }).exec()
  if (!market) return console.log('Error: Market not found')

  return { loanMarket, market }
}

async function getEmails(ethAddress) {
  console.log("Finding emails for ", ethAddress)
  const res = await EthAddress.findOne({address: ethAddress}).populate({path: 'emails', model: 'Email'}).exec()
  console.log(res)
  return res ? res.emails : {}
}

module.exports = {
  getMarketModels,
  getEmails
}
