const defineAgentsRouter = require('./agents')

// TODO: fix http error response codes in all routes

function defineArbiterRoutes (router) {
  defineAgentsRouter(router)
}

module.exports = defineArbiterRoutes
