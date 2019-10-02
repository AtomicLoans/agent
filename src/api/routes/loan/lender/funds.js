const _ = require('lodash')
const asyncHandler = require('express-async-handler')

const LoanMarket = require('../../../../models/LoanMarket')
const Fund = require('../../../../models/Fund')
const { verifySignature } = require('../../../../utils/signatures')
const { getInterval } = require('../../../../utils/intervals')
const { getObject } = require('../../../../utils/contracts')
const { getEthSigner } = require('../../../../utils/address')

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
    const address = getEthSigner()
    const { body } = req
    const { principal, collateral, custom, signature, message } = body

    // TODO: implement verify signature

    fund = await Fund.findOne({ principal, collateral, status: { $ne: 'FAILED' } }).exec()
    if (fund && fund.status === 'CREATED') return next(res.createError(401, 'Fund was already created. Agent can only have one Loan Fund'))

    const loanMarket = await LoanMarket.findOne(_.pick(body, ['principal', 'collateral'])).exec()
    if (!loanMarket) return next(res.createError(401, `LoanMarket not found with ${principal} principal and ${collateral} collateral`))

    if (custom) {
      fund = Fund.fromCustomFundParams(body)
    } else {
      const { maxLoanDuration, fundExpiry, compoundEnabled, amount } = body

      // const expectMessageParams = [
      //   principal,
      //   collateral,
      //   custom,
      //   maxLoanDuration,
      //   fundExpiry,
      //   compoundEnabled,
      //   amount
      // ]

      // const expectMessage = expectMessageParams.join('')

      const expectMessage = `Create ${custom ? 'Custom' : 'Non-Custom'} ${principal} Loan Fund backed by ${collateral} with ${compoundEnabled ? 'Compound Enabled' : 'Compound Disabled'} and Maximum Loan Duration of ${maxLoanDuration} seconds which expires at timestamp ${fundExpiry} and deposit ${amount} ${principal}`

      console.log('message', message)
      console.log('expectMessage', expectMessage)

      if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))
      if (!(message === expectMessage)) return next(res.createError(401, 'Message doesn\'t match params'))

      fund = Fund.fromFundParams(body)
    }

    await fund.save()
    await agenda.schedule(getInterval('ACTION_INTERVAL'), 'create-fund-ish', { fundModelId: fund.id })

    console.log('end /funds/new')

    res.json(fund.json())
  }))

  router.post('/funds/:fundModelId/withdraw', asyncHandler(async (req, res, next) => {
    console.log('start /funds/:fundModelId/withdraw')

    const currentTime = Math.floor(new Date().getTime() / 1000)
    const agenda = req.app.get('agenda')
    const address = getEthSigner()
    const { params } = req
    const { body } = req
    const { amountToWithdraw, signature, message, timestamp } = body

    const fund = await Fund.findOne({ _id: params.fundModelId }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    const { principal } = fund

    if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))

    console.log('message', message)
    console.log(`Withdraw ${amountToWithdraw} ${principal} at ${timestamp}`)

    if (!(message === `Withdraw ${amountToWithdraw} ${principal} at ${timestamp}`)) return next(res.createError(401, 'Message doesn\'t match params'))
    if (!(currentTime <= (timestamp + 60))) return next(res.createError(401, 'Signature is stale'))

    await agenda.schedule(getInterval('ACTION_INTERVAL'), 'fund-withdraw', { fundModelId: fund.id, amountToWithdraw })

    console.log('end /funds/:fundModelId/withdraw')

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
