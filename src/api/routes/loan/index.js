const router = require('express').Router()
const { isArbiter } = require('../../../utils/env')
const defineAgentRoutes = require('./agent')
const defineJobsRoutes = require('./jobs')
const defineLenderRoutes = require('./lender/index')
const defineArbiterRoutes = require('./arbiter/index')

defineAgentRoutes(router)
defineJobsRoutes(router)
if (isArbiter()) {
  defineArbiterRoutes(router)
} else {
  defineLenderRoutes(router)
}

module.exports = router
