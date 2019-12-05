const router = require('express').Router()
const { isArbiter } = require('../../../utils/env')
const defineAgentRoutes = require('./agent')
const defineJobsRoutes = require('./jobs')
const defineSalesRoutes = require('./sales')
const defineLenderRoutes = require('./lender/index')
const defineArbiterRoutes = require('./arbiter/index')
const defineTxsRoutes = require('./txs')

defineAgentRoutes(router)
defineJobsRoutes(router)
defineSalesRoutes(router)
if (isArbiter()) {
  defineArbiterRoutes(router)
} else {
  defineLenderRoutes(router)
}
defineTxsRoutes(router)

module.exports = router
