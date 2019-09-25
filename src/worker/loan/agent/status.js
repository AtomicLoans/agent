const axios = require('axios')

const { getEndpoint } = require('../../../utils/endpoints')
const LoanMarket = require('../../../models/LoanMarket')
const Agent = require('../../../models/Agent')

const { NETWORK, HEROKU_APP } = process.env

function defineAgentStatusJobs (agenda) {
  agenda.define('check-lender-status', async (job, done) => {
    const agents = await Agent.find().exec()

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i]
      await agenda.now('check-agent', { agentModelId: agent.id })
    }

    done()
  })

  agenda.define('check-agent', async (job, done) => {
    const { data } = job.attrs
    const { agentModelId } = data

    const agent = await Agent.findOne({ _id: agentModelId }).exec()
    const { status } = await axios.get(`${agent.url}/loanmarketinfo`)

    console.log(`${agent.url} status:`, status)

    if (status === 200) {
      agent.status = 'ACTIVE'
    } else {
      agent.status = 'INACTIVE'
    }
    await agent.save()

    done()
  })
}

module.exports = {
  defineAgentStatusJobs
}
