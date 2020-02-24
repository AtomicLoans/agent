const { defineNewAgentJobs } = require('./new')
const { defineAgentStatusJobs } = require('./status')
const { defineAgentApproveJobs } = require('./approve')
const { defineAgentUpdateJobs } = require('./update')

function defineAgentJobs (agenda) {
  defineNewAgentJobs(agenda)
  defineAgentStatusJobs(agenda)
  defineAgentApproveJobs(agenda)
  defineAgentUpdateJobs(agenda)
}

module.exports = {
  defineAgentJobs
}
