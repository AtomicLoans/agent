const axios = require('axios')

const { getEndpoint } = require('../../../utils/endpoints')
const LoanMarket = require('../../../models/LoanMarket')

function defineNewAgentJobs (agenda) {
  agenda.define('notify-arbiter', async (job, done) => {
    const loanMarkets = await LoanMarket.find().exec()
    const loanMarket = loanMarkets[0]

    const { collateralPublicKey, principalAddress } = await loanMarket.getAgentAddresses()

    const ethSigner = process.env.METAMASK_ETH_ADDRESS

    const { data } = await axios.post(`${getEndpoint('ARBITER_ENDPOINT')}/agents/new`, { collateralPublicKey, principalAddress, ethSigner })

    console.log('data', data)
  })
}

module.exports = {
  defineNewAgentJobs
}
