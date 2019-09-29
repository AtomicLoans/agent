const { defineFundCreateJobs } = require('./create')
const { defineFundWithdrawJobs } = require('./withdraw')

function defineFundsJobs (agenda) {
  defineFundCreateJobs(agenda)
  defineFundWithdrawJobs(agenda)
}

module.exports = {
  defineFundsJobs
}
