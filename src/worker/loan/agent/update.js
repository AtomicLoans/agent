const axios = require('axios')
const compareVersions = require('compare-versions')
const Agent = require('../../../models/Agent')
const web3 = require('../../../utils/web3')

function defineAgentUpdateJobs (agenda) {
  agenda.define('check-agent-updates', async (job, done) => {
    console.log('check-agent-updates')
    const agents = await Agent.find().exec()

    const { data: { name } } = await axios.get(
      'https://api.github.com/repos/AtomicLoans/agent/releases/latest'
    )

    const latestVersion = name.replace('v', '')

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i]
      await agenda.now('update-agent', { agentModelId: agent.id, latestVersion })
    }

    done()
  })

  agenda.define('update-agent', async (job, done) => {
    const { data } = job.attrs
    const { agentModelId, latestVersion } = data

    const agent = await Agent.findOne({ _id: agentModelId }).exec()

    try {
      const { data: { version } } = await axios.get(`${agent.url}/version`)
      const { data: { autoupdateEnabled } } = await axios.get(`${agent.url}/autoupdate`)
      if (autoupdateEnabled && compareVersions(version, latestVersion, '<')) {
        const { data: { principalAddress } } = await axios.get(`${agent.url}/agentinfo/ticker/USDC/BTC`)
        const currentTime = Math.floor(new Date().getTime() / 1000)

        const message = `Arbiter force update ${principalAddress} at ${currentTime}`
        const signature = await web3().personal.sign(message, (await web3().currentProvider.getAddresses())[0])

        await axios.post(`${agent.url}/autoupdate`, {
          signature,
          message,
          currentTime
        })
      }
    } catch (e) {
      console.error('Update failed', e)
    }

    done()
  })
}

module.exports = {
  defineAgentUpdateJobs
}
