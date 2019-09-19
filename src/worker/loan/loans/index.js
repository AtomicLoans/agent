const { defineLoanRequestJobs } = require('./request')
const { defineLoanLockJobs } = require('./lock')
const { defineLoanApproveJobs } = require('./approve')
const { defineLoanRepayJobs } = require('./repay')
const { defineLoanAcceptOrCancelJobs } = require('./acceptOrCancel')

function defineLoansJobs (agenda) {
  defineLoanRequestJobs(agenda)
  defineLoanLockJobs(agenda)
  defineLoanApproveJobs(agenda)
  defineLoanRepayJobs(agenda)
  defineLoanAcceptOrCancelJobs(agenda)
}

module.exports = {
  defineLoansJobs
}
