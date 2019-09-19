const { defineFundsJobs } = require('./funds')
const { defineLoansJobs } = require('./loans/index')

function defineLoanJobs (agenda) {
  defineFundsJobs(agenda)
  defineLoansJobs(agenda)
}

module.exports = {
  defineLoanJobs
}
