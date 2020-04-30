const defineFundsRouter = require('./funds')
const defineLoansRouter = require('./loans')
const defineSalesRouter = require('./sales')
const defineWithdrawRoutes = require('./withdraw')

function defineLenderRoutes (router) {
  defineFundsRouter(router)
  defineLoansRouter(router)
  defineSalesRouter(router)
  defineWithdrawRoutes(router)
}

module.exports = defineLenderRoutes
