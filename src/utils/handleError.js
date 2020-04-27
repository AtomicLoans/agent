const Bugsnag = require('@bugsnag/js')
const { getAgentUrl } = require('./url')
const { BUGSNAG_API } = process.env

if (BUGSNAG_API) {
  Bugsnag.start(BUGSNAG_API)
}

function handleError (e) {
  const agentUrl = getAgentUrl()

  Bugsnag.addMetadata(agentUrl)

  Bugsnag.notify(e)
}

module.exports = handleError
