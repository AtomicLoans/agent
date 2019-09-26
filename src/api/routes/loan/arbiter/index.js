const defineAgentsRouter = require('./agents')
const defineLoansRouter = require('./loans')

// TODO: fix http error response codes in all routes

function defineArbiterRoutes (router) {
  defineAgentsRouter(router)
  defineLoansRouter(router)
}

module.exports = defineArbiterRoutes
