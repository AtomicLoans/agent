const router = require('express').Router()
const defineAgentRoutes = require('./agent')
const defineJobsRoutes = require('./jobs')
const defineLenderRoutes = require('./lender/index')

defineAgentRoutes(router)
defineJobsRoutes(router)
defineLenderRoutes(router)

module.exports = router
