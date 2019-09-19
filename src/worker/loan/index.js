const { defineFundsJobs } = require('./funds/index')
const { defineLoansJobs } = require('./loans/index')

function defineLoanJobs (agenda) {
  defineFundsJobs(agenda)
  defineLoansJobs(agenda)
}

module.exports = {
  defineLoanJobs
}
