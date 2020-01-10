const { defineArbiterLoanJobs } = require('./loans')
const { defineArbiterPubKeyJobs } = require('./pubkey')
const { defineArbiterSecretsJobs } = require('./secrets')
const { defineArbiterStatusJobs } = require('./status')
const { defineMailerJobs } = require('./mailer')

function defineArbiterJobs (agenda) {
  defineArbiterLoanJobs(agenda)
  defineArbiterPubKeyJobs(agenda)
  defineArbiterSecretsJobs(agenda)
  defineArbiterStatusJobs(agenda)
  defineMailerJobs(agenda)
}

module.exports = {
  defineArbiterJobs
}
