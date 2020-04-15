const { defineSalesInitJobs } = require('./init')
const { defineSalesClaimJobs } = require('./claim')
const { defineSalesAcceptJobs } = require('./accept')
const { defineSalesRevertJobs } = require('./revert')

function defineSalesJobs (agenda) {
  defineSalesInitJobs(agenda)
  defineSalesClaimJobs(agenda)
  defineSalesAcceptJobs(agenda)
  defineSalesRevertJobs(agenda)
}

module.exports = {
  defineSalesJobs
}
