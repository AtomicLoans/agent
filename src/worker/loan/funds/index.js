const { defineFundCreateJobs } = require('./create')
const { defineFundWithdrawJobs } = require('./withdraw')
const { defineFundDepositJobs } = require('./deposit')

function defineFundsJobs (agenda) {
  defineFundCreateJobs(agenda)
  defineFundWithdrawJobs(agenda)
  defineFundDepositJobs(agenda)
}

module.exports = {
  defineFundsJobs
}
