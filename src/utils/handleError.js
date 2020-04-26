const bugsnag = require('@bugsnag/js')

let bugsnagClient
if (process.env.BUGSNAG_API) {
  bugsnagClient = bugsnag(process.env.BUGSNAG_API)
} else {
  bugsnagClient = {}
  bugsnagClient.notify = function (e) {
    console.log('notify', e)
  }
}

const { getAgentUrl } = require('./url')

function handleError (e) {
  const agentUrl = getAgentUrl()

  bugsnagClient.metaData = {
    agentUrl
  }

  bugsnagClient.notify(e)
}

module.exports = handleError
