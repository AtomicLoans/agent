const axios = require('axios')
const BN = require('bignumber.js')
const { remove0x } = require('@liquality/ethereum-utils')
const { sha256 } = require('@liquality/crypto')
const Sale = require('../../../models/Sale')
const Loan = require('../../../models/Loan')
const Secret = require('../../../models/Secret')
const { getCurrentTime } = require('../../../utils/time')
const { currencies } = require('../../../utils/fx')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { getLockArgs, getCollateralAmounts } = require('../utils/collateral')
const { getInitArgs } = require('../utils/collateralSwap')
const { isArbiter } = require('../../../utils/env')
const { getMarketModels } = require('../utils/models')
const { getEndpoint } = require('../../../utils/endpoints')
const clients = require('../../../utils/clients')

const web3 = require('web3')
const { toWei, hexToNumber } = web3.utils

function defineSalesClaimJobs (agenda) {
  agenda.define('verify-collateral-claim', async (job, done) => {

    // THIS JOB IS ONLY DONE BY THE LENDER AGENT

    console.log('verify-collateral-claim')

    const { data } = job.attrs
    const { saleModelId } = data

    const sale = await Sale.findOne({ _id: saleModelId }).exec()
    if (!sale) return console.log('Error: Sale not found')
    const { initTxHash } = sale

    console.log('initTxHash', initTxHash)

    const collateralBlockHeight = await sale.collateralClient().chain.getBlockHeight()
    const { latestCollateralBlock } = sale
    let curBlock = latestCollateralBlock + 1

    let claimTxHash
    while (curBlock <= collateralBlockHeight) {
      const block = await sale.collateralClient().chain.getBlockByNumber(curBlock)
      const txs = await Promise.all(block.transactions.map((txid) => {
        return sale.collateralClient().getMethod('getTransactionByHash')(txid)
      }))

      for (let i = 0; i < txs.length; i++) {
        const tx = txs[i]
        const vins = tx._raw.vin
        for (let j = 0; j < vins.length; j++) {
          const vin = vins[j]
          vin.txid

          if (vin.txid === initTxHash) {
            console.log('COLLATERAL_CLAIMED FOUND')
            sale.claimTxHash = tx.hash
            sale.status = 'COLLATERAL_CLAIMED'
            curBlock = collateralBlockHeight + 1
            break
          }
        }
      }

      curBlock++
    }

    sale.latestCollateralBlock = collateralBlockHeight

    await sale.save()

    done()
  })
}

module.exports = {
  defineSalesClaimJobs
}
