const { defineFundCreateJobs } = require('./create')

function defineFundsJobs (agenda) {
  defineFundCreateJobs(agenda)
}

module.exports = {
  defineFundsJobs
}
