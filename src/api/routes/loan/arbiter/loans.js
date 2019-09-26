const asyncHandler = require('express-async-handler')
const BN = require('bignumber.js')
const { ensure0x } = require('@liquality/ethereum-utils')
const { verifySignature } = require('../../../../utils/signatures')
const clients = require('../../../../utils/clients')
const { getObject } = require('../../../../utils/contracts')
const { getEthSigner } = require('../../../../utils/address')
const { getInterval } = require('../../../../utils/intervals')
const { numToBytes32 } = require('../../../../utils/finance')
const web3 = require('web3')
const { fromWei, hexToAscii } = web3.utils

const LoanMarket = require('../../../../models/LoanMarket')
const Market = require('../../../../models/Market')
const Fund = require('../../../../models/Fund')
const Loan = require('../../../../models/Loan')

function defineLoansRouter (router) {
  router.get('/loans', asyncHandler(async (req, res) => {
    const result = await Loan.find().exec()

    res.json(result.map(r => r.json()))
  }))
}

module.exports = defineLoansRouter
