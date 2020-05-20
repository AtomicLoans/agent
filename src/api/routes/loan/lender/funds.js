const _ = require('lodash')
const axios = require('axios')
const asyncHandler = require('express-async-handler')

const LoanMarket = require('../../../../models/LoanMarket')
const Fund = require('../../../../models/Fund')
const HotColdWalletProxy = require('../../../../models/HotColdWalletProxy')
const { verifySignature, verifyTimestampedSignature } = require('../../../../utils/signatures')
const { getObject } = require('../../../../utils/contracts')
const { getInterval } = require('../../../../utils/intervals')
const { getEthSigner } = require('../../../../utils/address')
const { getEndpoint } = require('../../../../utils/endpoints')
const { numToBytes32 } = require('../../../../utils/finance')

const web3 = require('../../../../utils/web3')
const { hexToNumber } = web3().utils

function defineFundsRouter (router) {
  router.get('/funds/:fundModelId', asyncHandler(async (req, res, next) => {
    const { params } = req

    const fund = await Fund.findOne({ _id: params.fundModelId }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    res.json(fund.json())
  }))

  router.get('/funds/ticker/:principal', asyncHandler(async (req, res, next) => {
    const { params } = req

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
    const { principal, collateral } = body

    const loanMarket = await LoanMarket.findOne(_.pick(body, ['principal', 'collateral'])).exec()
    if (!loanMarket) return next(res.createError(401, `LoanMarket not found with ${principal} principal and ${collateral} collateral`))

    fund = await Fund.findOne({ principal, collateral, status: { $ne: 'FAILED' } }).exec()
    if (fund && fund.status === 'CREATED') return next(res.createError(401, 'Fund was already created. Agent can only have one Loan Fund'))

    const { proxyEnabled, principalAgentAddress } = await loanMarket.getAgentAddresses()

    if (proxyEnabled) {
      const { proxyAddress } = body

      // create hot cold wallet proxy record (after verifying fund was created)

      // get fund detail and create record

      const funds = getObject('funds', principal)
      const loans = getObject('loans', principal)
      const sales = getObject('sales', principal)
      const proxy = getObject('hotcoldwallet', proxyAddress)

      const { _address: fundsAddress } = funds
      const { _address: loansAddress } = loans
      const { _address: salesAddress } = sales

      const fundIdBytes32 = await funds.methods.fundOwner(proxyAddress).call()

      const {
        minLoanAmt: minLoanAmount,
        maxLoanAmt: maxLoanAmount,
        minLoanDur: minLoanDuration,
        maxLoanDur: maxLoanDuration,
        fundExpiry,
        interest,
        penalty,
        fee,
        liquidationRatio
      } = await funds.methods.funds(fundIdBytes32).call()

      const { custom, compoundEnabled } = await funds.methods.bools(fundIdBytes32).call()
      const amount = await funds.methods.balance(fundIdBytes32).call()

      const fundParams = {
        principal,
        collateral,
        custom,
        minLoanAmount,
        maxLoanAmount,
        minLoanDuration,
        maxLoanDuration,
        fundExpiry,
        interest,
        penalty,
        fee,
        liquidationRatio,
        compoundEnabled,
        amount
      }

      if (custom) {
        fund = Fund.fromCustomFundParams(fundParams)
      } else {
        fund = Fund.fromFundParams(fundParams)
      }

      const proxyColdAddress = await proxy.methods.cold().call()
      const proxyHotAddress = await proxy.methods.hot().call()
      const proxyFundsAddress = await proxy.methods.funds().call()
      const proxyLoansAddress = await proxy.methods.loans().call()
      const proxySalesAddress = await proxy.methods.sales().call()

      const fundsMatch = fundsAddress === proxyFundsAddress
      const loansMatch = loansAddress === proxyLoansAddress
      const salesMatch = salesAddress === proxySalesAddress
      const agentAddressesMatch = principalAgentAddress === proxyHotAddress
      const coldAddressesMatch = address === proxyColdAddress

      if (fundsMatch && loansMatch && salesMatch && agentAddressesMatch && coldAddressesMatch) {
        const proxyParams = { principal, collateral, hotWalletAddress: proxyHotAddress, coldWalletAddress: proxyColdAddress, contractAddress: proxyAddress }
        const proxyModel = HotColdWalletProxy.fromWalletAddresses(proxyParams)

        await agenda.schedule(getInterval('ACTION_INTERVAL'), 'notify-arbiter')

        await proxyModel.save()
        await fund.save()
      } else {
        return next(res.createError(401, 'Addresses don\'t match proxy config'))
      }
    } else {
      const { custom, signature, message, maxLoanDuration, fundExpiry, compoundEnabled, amount } = body

      if (custom) {
        const { liquidationRatio, interest, penalty, fee } = body
        const expectMessage = `Create Custom ${principal} Loan Fund backed by ${collateral} with ${compoundEnabled ? 'Compound Enabled' : 'Compound Disabled'} and Maximum Loan Duration of ${maxLoanDuration} seconds which expires at timestamp ${fundExpiry}, a liquidation ratio of ${liquidationRatio}, interest of ${interest}, penalty ${penalty}, fee ${fee}, and deposit ${amount} ${principal}`

        if (!process.env.NODE_ENV === 'test') {
          if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))
          if (!(message === expectMessage)) return next(res.createError(401, `Message doesn't match params (Expected Message: ${expectMessage}... Actual Message: ${message})`))
        }

        fund = Fund.fromCustomFundParams(body)
      } else {
        const expectMessage = `Create Non-Custom ${principal} Loan Fund backed by ${collateral} with ${compoundEnabled ? 'Compound Enabled' : 'Compound Disabled'} and Maximum Loan Duration of ${maxLoanDuration} seconds which expires at timestamp ${fundExpiry} and deposit ${amount} ${principal}`

        if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))
        if (!(message === expectMessage)) return next(res.createError(401, `Message doesn't match params (Expected Message: ${expectMessage}... Actual Message: ${message})`))

        fund = Fund.fromFundParams(body)
      }

      await fund.save()
      await agenda.schedule(getInterval('ACTION_INTERVAL'), 'create-fund', { fundModelId: fund.id })
    }

    console.log('end /funds/new')

    res.json(fund.json())
  }))

  router.post('/funds/:fundModelId/withdraw', asyncHandler(async (req, res, next) => {
    console.log('start /funds/:fundModelId/withdraw')

    const agenda = req.app.get('agenda')
    const { params } = req
    const { body } = req
    const { amountToWithdraw, signature, message, timestamp } = body

    const fund = await Fund.findOne({ _id: params.fundModelId }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    const { principal } = fund

    try {
      verifyTimestampedSignature(signature, message, `Withdraw ${amountToWithdraw} ${principal} at ${timestamp}`, timestamp)
    } catch (e) {
      return next(res.createError(401, e.message))
    }

    await agenda.schedule(getInterval('ACTION_INTERVAL'), 'fund-withdraw', { fundModelId: fund.id, amountToWithdraw })

    console.log('end /funds/:fundModelId/withdraw')

    res.json(fund.json())
  }))

  router.post('/funds/contract/:fundId/withdraw', asyncHandler(async (req, res, next) => {
    console.log('start /funds/contract/:fundId/withdraw')

    const agenda = req.app.get('agenda')
    const { params } = req
    const { body } = req
    const { amountToWithdraw, signature, message, timestamp } = body

    const fund = await Fund.findOne({ fundId: params.fundId }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    const { principal } = fund

    try {
      verifyTimestampedSignature(signature, message, `Withdraw ${amountToWithdraw} ${principal} at ${timestamp}`, timestamp)
    } catch (e) {
      return next(res.createError(401, e.message))
    }

    await agenda.schedule(getInterval('ACTION_INTERVAL'), 'fund-withdraw', { fundModelId: fund.id, amountToWithdraw })

    console.log('end /funds/contract/:fundId/withdraw')

    res.json(fund.json())
  }))

  router.post('/funds/contract/:principal/:fundId/withdraw', asyncHandler(async (req, res, next) => {
    console.log('start /funds/contract/:fundId/withdraw')

    const agenda = req.app.get('agenda')
    const { params, body } = req
    const { amountToWithdraw, signature, message, timestamp } = body

    const fund = await Fund.findOne({ principal: params.principal, fundId: params.fundId }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    const { principal } = fund

    try {
      verifyTimestampedSignature(signature, message, `Withdraw ${amountToWithdraw} ${principal} at ${timestamp}`, timestamp)
    } catch (e) {
      return next(res.createError(401, e.message))
    }

    await agenda.schedule(getInterval('ACTION_INTERVAL'), 'fund-withdraw', { fundModelId: fund.id, amountToWithdraw })

    console.log('end /funds/contract/:fundId/withdraw')

    res.json(fund.json())
  }))

  router.post('/funds/contract/:principal/:fundId/deposit', asyncHandler(async (req, res, next) => {
    console.log('start /funds/contract/:fundId/deposit')

    const agenda = req.app.get('agenda')

    const { params, body } = req
    const { fundId, principal } = params
    const { ethTxId } = body

    const fund = await Fund.findOne({ principal, fundId }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    await agenda.now('fund-lender-deposit', { principal, fundId, ethTxId })

    console.log('end /funds/contract/:fundId/deposit')

    res.json(fund.json())
  }))

  router.post('/funds/contract/:principal/:fundId/update', asyncHandler(async (req, res, next) => {
    console.log('start /funds/contract/:principal/:fundId/update')

    const agenda = req.app.get('agenda')
    const { params, body } = req
    const { maxLoanDuration, fundExpiry, signature, message, timestamp } = body
    const { fundId, principal } = params

    const fund = await Fund.findOne({ fundId, principal }).exec()
    if (!fund) return next(res.createError(401, 'Fund not found'))

    try {
      verifyTimestampedSignature(signature, message, `Update ${principal} Fund with maxLoanDuration: ${maxLoanDuration} and fundExpiry ${fundExpiry} at timestamp ${timestamp}`, timestamp)
    } catch (e) {
      return next(res.createError(401, e.message))
    }

    const { status, data } = await axios.get(`${getEndpoint('ARBITER_ENDPOINT')}/agentinfo/ticker/${principal}/BTC`)

    if (status === 200) {
      const { principalAddress: arbiter } = data

      await agenda.schedule(getInterval('ACTION_INTERVAL'), 'fund-update', { fundModelId: fund.id, maxLoanDuration, fundExpiry, arbiter })

      console.log('end /funds/contract/:principal/:fundId/update')

      res.json(fund.json())
    } else {
      return next(res.createError(401, 'Arbiter down'))
    }
  }))

  if (process.env.NODE_ENV === 'test') {
    router.post('/remove_funds', asyncHandler(async (req, res, next) => {
      console.log('remove_funds')

      await Fund.deleteMany()

      res.json({ message: 'Removed all funds' })
    }))
  }
}

module.exports = defineFundsRouter
