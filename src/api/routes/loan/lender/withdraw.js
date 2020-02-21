const asyncHandler = require('express-async-handler')
const BN = require('bignumber.js')
const { verifyTimestampedSignature } = require('../../../../utils/signatures')
const clients = require('../../../../utils/clients')
const { currencies } = require('../../../../utils/fx')
const { getEthSigner } = require('../../../../utils/address')

function defineWithdrawRoutes (router) {
  router.post('/withdraw', asyncHandler(async (req, res, next) => {
    const address = getEthSigner()

    const { body } = req
    const { signature, message, amount, timestamp, currency } = body

    try {
      verifyTimestampedSignature(signature, message, `Withdraw ${amount} ${currency} to ${address} at ${timestamp}`, timestamp)
    } catch (e) {
      return next(res.createError(401, e.message))
    }

    const toAmount = BN(amount).times(currencies[currency].multiplier).toFixed()

    const withdrawHash = await clients[currency].chain.sendTransaction(address, toAmount)

    res.json({ withdrawHash })
  }))
}

module.exports = defineWithdrawRoutes
