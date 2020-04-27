const Bugsnag = require('@bugsnag/js')
const { getAgentUrl } = require('./url')

if (process.env.BUGSNAG_API) {
  Bugsnag.start(process.env.BUGSNAG_API)
}

function handleError (e) {
  const agentUrl = getAgentUrl()

  Bugsnag.metaData = {
    agentUrl
  }

  Bugsnag.notify(e)
}

module.exports = handleError
