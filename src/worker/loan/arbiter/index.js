const { defineArbiterLoanJobs } = require('./loans')
const { defineArbiterPubKeyJobs } = require('./pubkey')
const { defineArbiterSecretsJobs } = require('./secrets')
const { defineArbiterStatusJobs } = require('./status')

function defineArbiterJobs (agenda) {
  defineArbiterLoanJobs(agenda)
  defineArbiterPubKeyJobs(agenda)
  defineArbiterSecretsJobs(agenda)
  defineArbiterStatusJobs(agenda)
}

module.exports = {
  defineArbiterJobs
}
