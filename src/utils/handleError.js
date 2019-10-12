const bugsnag = require('@bugsnag/js')
const bugsnagClient = bugsnag(process.env.BUGSNAG_API)
const { getAgentUrl } = require('./url')
const { getEndpoint } = require('./endpoints')

function handleError (e) {
  agentUrl = getAgentUrl()

  bugsnagClient.metaData = {
    agentUrl
  }

  bugsnagClient.notify(e)
}

module.exports = handleError
