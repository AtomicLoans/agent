const defineFundsRouter = require('./funds')
const defineLoansRouter = require('./loans')
const defineSalesRouter = require('./sales')
const defineProxyRouter = require('./proxy')
const defineWithdrawRouter = require('./withdraw')

function defineLenderRoutes (router) {
  defineFundsRouter(router)
  defineLoansRouter(router)
  defineSalesRouter(router)
  defineProxyRouter(router)
  defineWithdrawRouter(router)
}

module.exports = defineLenderRoutes
