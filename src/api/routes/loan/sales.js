const asyncHandler = require('express-async-handler')
const BN = require('bignumber.js')
const { ensure0x } = require('@liquality/ethereum-utils')
const { verifySignature } = require('../../../utils/signatures')
const clients = require('../../../utils/clients')
const { getObject } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { numToBytes32 } = require('../../../utils/finance')
const web3 = require('web3')
const { fromWei, hexToAscii } = web3.utils

const LoanMarket = require('../../../models/LoanMarket')
const Loan = require('../../../models/Loan')
const Market = require('../../../models/Market')
const Fund = require('../../../models/Fund')
const Sale = require('../../../models/Sale')

function defineSalesRouter (router) {
  router.get('/sales', asyncHandler(async (req, res) => {
    const result = await Sale.find().exec()

    res.json(result.map(r => r.json()))
  }))

  router.get('/sales/contract/:principal/:saleId', asyncHandler(async (req, res, next) => {
    const { params } = req
    const { principal, saleId } = params

    const sale = await Sale.findOne({ principal, saleId }).exec()
    if (!sale) return next(res.createError(401, 'Sale not found'))

    res.json(sale.json())
  }))
}

module.exports = defineSalesRouter
