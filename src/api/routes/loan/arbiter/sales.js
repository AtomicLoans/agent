const asyncHandler = require('express-async-handler')
const stringify = require('json-stable-stringify')
const { verifyTimestampedSignatureUsingExpected } = require('../../../../utils/signatures')
const Loan = require('../../../../models/Loan')

function defineSalesRouter (router) {
  router.post('/sales/new', asyncHandler(async (req, res, next) => {
    console.log('start /sales/new')
    const agenda = req.app.get('agenda')
    const { body } = req
    const { principal, loanId, lenderSigs, refundableAmount, seizableAmount, signature, address, timestamp } = body

    try {
      verifyTimestampedSignatureUsingExpected(signature, `New sale (${principal} ${loanId} ${stringify(lenderSigs)} ${refundableAmount} ${seizableAmount}) ${timestamp}`, timestamp, address)
    } catch (e) {
      return next(res.createError(401, e.message))
    }

    const loan = await Loan.findOne({ principal, loanId }).exec()
    if (!loan) return next(res.createError(401, 'Loan not found'))

    await agenda.now('init-liquidation', { loanModelId: loan.id, lenderSigs, refundableAmount, seizableAmount })

    res.json({ message: 'success' })

    console.log('end /sales/new')
  }))
}

module.exports = defineSalesRouter
