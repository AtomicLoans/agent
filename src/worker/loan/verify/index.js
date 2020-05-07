const { defineVerifyJobs } = require('./verify')

function defineRootVerifyJobs (agenda) {
  defineVerifyJobs(agenda)
}

module.exports = {
  defineRootVerifyJobs
}
