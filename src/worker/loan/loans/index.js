const { defineLoanRequestJobs } = require('./request')
const { defineLoanLockJobs } = require('./lock')
const { defineLoanApproveJobs } = require('./approve')
const { defineLoanAcceptOrCancelJobs } = require('./acceptOrCancel')
const { defineLoanStatusJobs } = require('./status')
const { defineLoanCheckJobs } = require('./loanCheck')

function defineLoansJobs (agenda) {
  defineLoanRequestJobs(agenda)
  defineLoanLockJobs(agenda)
  defineLoanApproveJobs(agenda)
  defineLoanAcceptOrCancelJobs(agenda)
  defineLoanStatusJobs(agenda)
  defineLoanCheckJobs(agenda)
}

module.exports = {
  defineLoansJobs
}
