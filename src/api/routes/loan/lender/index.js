const defineFundsRouter = require('./funds')
const defineLoansRouter = require('./loans')
const defineSalesRouter = require('./sales')
const defineWithdrawRoutes = require('./withdraw')

// TODO: fix http error response codes in all routes

function defineLenderRoutes (router) {
  defineFundsRouter(router)
  defineLoansRouter(router)
  defineSalesRouter(router)
  defineWithdrawRoutes(router)
}

module.exports = defineLenderRoutes
