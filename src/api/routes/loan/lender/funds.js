const _ = require('lodash')
const asyncHandler = require('express-async-handler')

const LoanMarket = require('../../../../models/LoanMarket')
const Fund = require('../../../../models/Fund')

function defineFundsRouter (router) {
  router.get('/funds/:fundModelId', asyncHandler(async (req, res, next) => {
    const { params } = req

    const fund = await Fund.findOne({ _id: params.fundModelId }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    res.json(fund.json())
  }))

  router.get('/funds/ticker/:principal', asyncHandler(async (req, res, next) => {
    const { params } = req

    console.log('params', params)

    const fund = await Fund.findOne({ principal: params.principal.toUpperCase(), status: { $ne: 'FAILED' } }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    res.json(fund.json())
  }))

  router.post('/funds/new', asyncHandler(async (req, res, next) => {
    console.log('start /funds/new')
    let fund
    const agenda = req.app.get('agenda')
    const { body } = req
    const { principal, collateral, custom } = body

    fund = await Fund.findOne({ principal, collateral, status: { $ne: 'FAILED' } }).exec()
    if (fund && fund.status === 'CREATED') return next(res.createError(401, 'Fund was already created. Agent can only have one Loan Fund'))

    const loanMarket = await LoanMarket.findOne(_.pick(body, ['principal', 'collateral'])).exec()
    if (!loanMarket) return next(res.createError(401, `LoanMarket not found with ${principal} principal and ${collateral} collateral`))

    if (custom) {
      fund = Fund.fromCustomFundParams(body)
    } else {
      fund = Fund.fromFundParams(body)
    }
    await agenda.now('create-fund', { fundModelId: fund.id })

    await fund.save()

    console.log('end /funds/new')

    res.json(fund.json())
  }))

  if (process.env.NODE_ENV === 'test') {
    router.post('/remove_funds', asyncHandler(async (req, res, next) => {
      await Fund.deleteMany()

      res.json({ message: 'Removed all funds' })
    }))
  }
}

module.exports = defineFundsRouter
