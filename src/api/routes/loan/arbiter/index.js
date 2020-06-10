const defineAgentsRouter = require('./agents')
const defineLiquidatorsRouter = require('./liquidators')
const defineLoansRouter = require('./loans')
const defineSalesRouter = require('./sales')

// TODO: fix http error response codes in all routes

function defineArbiterRoutes (router) {
  defineAgentsRouter(router)
  defineLiquidatorsRouter(router)
  defineLoansRouter(router)
  defineSalesRouter(router)
}

module.exports = defineArbiterRoutes
