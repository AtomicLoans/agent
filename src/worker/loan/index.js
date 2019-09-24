const { defineFundsJobs } = require('./funds/index')
const { defineLoansJobs } = require('./loans/index')
const { defineArbiterJobs } = require('./arbiter/index')
const { defineAgentJobs } = require('./agent/index')

function defineLoanJobs (agenda) {
  defineFundsJobs(agenda)
  defineLoansJobs(agenda)
  defineArbiterJobs(agenda)
  defineAgentJobs(agenda)
}

module.exports = {
  defineLoanJobs
}
