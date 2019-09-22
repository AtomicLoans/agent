const { defineArbiterPubKeyJobs } = require('./pubkey')
const { defineArbiterSecretsJobs } = require('./secrets')
const { defineArbiterStatusJobs } = require('./status')

function defineArbiterJobs (agenda) {
  defineArbiterPubKeyJobs(agenda)
  defineArbiterSecretsJobs(agenda)
  defineArbiterStatusJobs(agenda)
}

module.exports = {
  defineArbiterJobs
}
