const { defineArbiterLoanJobs } = require('./loans')
const { defineArbiterPubKeyJobs } = require('./pubkey')
const { defineArbiterSecretsJobs } = require('./secrets')
const { defineArbiterStatusJobs } = require('./status')
const { defineOracleJobs } = require('./oracle')

function defineArbiterJobs (agenda) {
  defineArbiterLoanJobs(agenda)
  defineArbiterPubKeyJobs(agenda)
  defineArbiterSecretsJobs(agenda)
  defineArbiterStatusJobs(agenda)
  defineOracleJobs(agenda)
}

module.exports = {
  defineArbiterJobs
}
