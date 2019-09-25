const { defineNewAgentJobs } = require('./new')
const { defineAgentStatusJobs } = require('./status')

function defineAgentJobs (agenda) {
  defineNewAgentJobs(agenda)
  defineAgentStatusJobs(agenda)
}

module.exports = {
  defineAgentJobs
}
