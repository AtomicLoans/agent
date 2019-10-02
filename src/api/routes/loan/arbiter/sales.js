const asyncHandler = require('express-async-handler')
const BN = require('bignumber.js')
const { ensure0x } = require('@liquality/ethereum-utils')
const { verifySignature } = require('../../../../utils/signatures')
const clients = require('../../../../utils/clients')
const { getObject } = require('../../../../utils/contracts')
const { getInterval } = require('../../../../utils/intervals')
const { numToBytes32 } = require('../../../../utils/finance')
const web3 = require('web3')
const { fromWei, hexToAscii } = web3.utils

const LoanMarket = require('../../../../models/LoanMarket')
const Loan = require('../../../../models/Loan')
const Market = require('../../../../models/Market')
const Fund = require('../../../../models/Fund')
const Sale = require('../../../../models/Sale')

function defineSalesRouter (router) {
  router.post('/sales/new', asyncHandler(async (req, res, next) => {
    console.log('start /sales/new')
    const agenda = req.app.get('agenda')
    const { params, body } = req
    const { principal, loanId, lenderSigs, refundableAmount, seizableAmount } = body

    const loan = await Loan.findOne({ principal, loanId }).exec()
    if (!loan) return next(res.createError(401, 'Loan not found'))

    await agenda.now('init-liquidation', { loanModelId: loan.id, lenderSigs, refundableAmount, seizableAmount })

    res.json({ message: 'success' })

    console.log('end /sales/new')
  }))
}

module.exports = defineSalesRouter
