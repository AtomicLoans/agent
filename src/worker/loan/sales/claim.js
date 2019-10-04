const Sale = require('../../../models/Sale')

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
