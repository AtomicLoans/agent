const asyncHandler = require('express-async-handler')

const Loan = require('../../../../models/Loan')
const Sale = require('../../../../models/Sale')
const { getInitArgs } = require('../../../../worker/loan/utils/collateralSwap')
const { numToBytes32 } = require('../../../../utils/finance')

function defineSalesRouter (router) {
  router.post('/sales/contract/:principal/:saleId/revert', asyncHandler(async (req, res, next) => {
    console.log('/sales/contract/:principal/:saleId/revert')

    const { params, body } = req
    const { principal, saleId } = params
    const { arbiterSigs } = body

    const sale = await Sale.findOne({ principal, saleId }).exec()
    if (!sale) return next(res.createError(401, 'Sale not found'))

    const { loanModelId, collateral, collateralSwapRefundableP2SHAddress } = sale

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return next(res.createError(401, 'Loan not found'))

    const { loanId, collateralRefundableP2SHAddress, collateralSeizableP2SHAddress } = loan

    const swapParams = await getInitArgs(numToBytes32(loanId), numToBytes32(saleId), principal, collateral)

    const refundableUnspent = await loan.collateralClient().getMethod('getUnspentTransactions')([collateralSwapRefundableP2SHAddress])

    if (refundableUnspent.length > 0) {
      const lockTxHash = refundableUnspent[0].txid
      const party = 'lender'

      const outputs = [{ address: collateralRefundableP2SHAddress }, { address: collateralSeizableP2SHAddress }]

      const multisigParams = [lockTxHash, ...swapParams, party, outputs]
      console.log('multisigParams', multisigParams)
      console.log('about to multisigWrite')
      const lenderSigs = await loan.collateralClient().loan.collateralSwap.multisigWrite(...multisigParams)
      console.log('finished multisigWrite')

      try {
        const sigs = {
          refundable: [Buffer.from(arbiterSigs.refundableSig, 'hex'), Buffer.from(lenderSigs.refundableSig, 'hex')],
          seizable: [Buffer.from(arbiterSigs.seizableSig, 'hex'), Buffer.from(lenderSigs.seizableSig, 'hex')]
        }

        console.log('lockTxHash, sigs, ...swapParams, outputs', lockTxHash, sigs, ...swapParams, outputs)
        const multisigSendTxRaw = await loan.collateralClient().loan.collateralSwap.multisigMake(lockTxHash, sigs, ...swapParams, outputs)
        console.log('multisigSendTxRaw', multisigSendTxRaw)

        const txHash = await loan.collateralClient().chain.sendRawTransaction(multisigSendTxRaw)
        console.log('txHash', txHash)

        res.json({ txHash })
      } catch (e) {
        const sigs = {
          refundable: [Buffer.from(lenderSigs.refundableSig, 'hex'), Buffer.from(arbiterSigs.refundableSig, 'hex')],
          seizable: [Buffer.from(lenderSigs.seizableSig, 'hex'), Buffer.from(arbiterSigs.seizableSig, 'hex')]
        }

        console.log('lockTxHash, sigs, ...swapParams, outputs', lockTxHash, sigs, ...swapParams, outputs)
        const multisigSendTxRaw = await loan.collateralClient().loan.collateralSwap.multisigMake(lockTxHash, sigs, ...swapParams, outputs)
        console.log('multisigSendTxRaw', multisigSendTxRaw)

        const txHash = await loan.collateralClient().chain.sendRawTransaction(multisigSendTxRaw)
        console.log('txHash', txHash)

        res.json({ txHash })
      }
    } else {
      return next(res.createError(401, 'No funds to revert'))
    }
  }))
}

module.exports = defineSalesRouter
