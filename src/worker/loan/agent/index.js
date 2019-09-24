const { defineNewAgentJobs } = require('./new')

function defineAgentJobs (agenda) {
  defineNewAgentJobs(agenda)
}

module.exports = {
  defineAgentJobs
}
