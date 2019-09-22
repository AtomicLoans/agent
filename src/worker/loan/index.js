const { defineFundsJobs } = require('./funds/index')
const { defineLoansJobs } = require('./loans/index')
const { defineArbiterJobs } = require('./arbiter/index')

function defineLoanJobs (agenda) {
  defineFundsJobs(agenda)
  defineLoansJobs(agenda)
  defineArbiterJobs(agenda)
}

module.exports = {
  defineLoanJobs
}
