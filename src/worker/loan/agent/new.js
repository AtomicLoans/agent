const axios = require('axios')

const { getEndpoint } = require('../../../utils/endpoints')
const AgendaJob = require('../../../models/AgendaJob')
const LoanMarket = require('../../../models/LoanMarket')
const { getInterval } = require('../../../utils/intervals')
const web3 = require('../../../utils/web3')

const { NETWORK, HEROKU_APP, AL_APP, AGENT_URL } = process.env

function defineNewAgentJobs (agenda) {
  agenda.define('notify-arbiter', async (job, done) => {
    const loanMarkets = await LoanMarket.find().exec()
    const loanMarket = loanMarkets[0]

    const { collateralPublicKey, principalAddress } = await loanMarket.getAgentAddresses()

    let url
    if (NETWORK === 'test') {
      url = getEndpoint('LENDER_ENDPOINT')
    } else if (HEROKU_APP !== undefined && HEROKU_APP !== 'undefined') {
      url = `https://${HEROKU_APP}.herokuapp.com/api/loan`
    } else if (AL_APP === 'true') {
      url = 'https://atomicloans.io/lender-agent/api/loan'
    } else {
      url = `${AGENT_URL}/api/loan`
    }

    console.log('notify-arbiter')

    const ethSigner = process.env.METAMASK_ETH_ADDRESS

    const timestamp = Math.floor(new Date().getTime() / 1000)
    const message = `Register new agent (${principalAddress} ${collateralPublicKey} ${ethSigner} ${url}) ${timestamp}`
    const signature = await web3().eth.personal.sign(message, (await web3().currentProvider.getAddresses())[0])

    try {
      console.log('posting...')
      await axios.post(`${getEndpoint('ARBITER_ENDPOINT')}/agents/new`, { collateralPublicKey, principalAddress, ethSigner, url, signature, timestamp })
      done()
    } catch (e) {
      console.log('`notify-arbiter` failed. Retrying...')

      const alreadyRunningJobs = await AgendaJob.find({ name: 'notify-arbiter', lastRunAt: { $ne: null }, lastFinishedAt: null }).exec()
      const alreadyQueuedJobs = await AgendaJob.find({ name: 'notify-arbiter', nextRunAt: { $ne: null } }).exec()

      if (alreadyRunningJobs.length <= 1 && alreadyQueuedJobs.length <= 0) {
        agenda.schedule(getInterval('REQUEUE_NOTIFY_INTERVAL'), 'notify-arbiter')
      }

      console.log(e)
      done(e)
    }

    // TODO: verify that this was done correctly, and create an endpoint for checking this
  })
}

module.exports = {
  defineNewAgentJobs
}
