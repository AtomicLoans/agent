const { defineSalesInitJobs } = require('./init')

function defineSalesJobs (agenda) {
  defineSalesInitJobs(agenda)
}

module.exports = {
  defineSalesJobs
}
