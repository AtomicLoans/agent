const asyncHandler = require('express-async-handler')
const { verifyTimestampedSignature } = require('../../../utils/signatures')
const { getEthSigner } = require('../../../utils/address')

function defineResetRouter (router) {
  router.post('/reset', asyncHandler(async (req, res, next) => {
    const agenda = req.app.get('agenda')
    const currentTime = Math.floor(new Date().getTime() / 1000)
    const address = getEthSigner()

    const { body } = req
    const { signature, message, timestamp } = body

    console.log('signature, message, timestamp', signature, message, timestamp)

    try {
      verifyTimestampedSignature(signature, message, timestamp)
    } catch (e) {
      return next(res.createError(401, e.message))
    }

    await agenda.now('sanitize-eth-txs', { timePeriod: 0 })

    res.json({ message: 'success' })
  }))
}

module.exports = defineResetRouter
