const axios = require('axios')
const compareVersions = require('compare-versions')
const log = require('@mblackmblack/node-pretty-log')
const handleError = require('../../../utils/handleError')
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
    const { status, url } = agent

    if (status === 'ACTIVE') {
      try {
        const { data: { version } } = await axios.get(`${url}/version`)
        const { data: { autoupdateEnabled } } = await axios.get(`${url}/autoupdate`)
        if (autoupdateEnabled && compareVersions.compare(version, latestVersion, '<')) {
          const { data: { principalAddress } } = await axios.get(`${url}/agentinfo/ticker/USDC/BTC`)
          const timestamp = Math.floor(new Date().getTime() / 1000)

          const message = `Arbiter force update ${principalAddress} at ${timestamp}`
          const signature = await web3().eth.personal.sign(message, (await web3().currentProvider.getAddresses())[0])

          await axios.post(`${url}/autoupdate`, {
            signature,
            message,
            timestamp
          })
        }
      } catch (e) {
        const { url } = e.config
        const { status, statusText, data: { error: dataError } } = e.response

        log('error', `Update Agent Job | ${url} ${status} ${statusText} | ${dataError}`)
        handleError(e)
      }
    } else {
      console.log(`Agent ${url} inactive`)
    }

    done()
  })
}

module.exports = {
  defineAgentUpdateJobs
}
