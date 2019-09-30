const Loan = require('../../../models/Loan')
const { getCurrentTime } = require('../../../utils/time')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { getLockArgs, getCollateralAmounts } = require('../utils/collateral')
const { getInitArgs } = require('../utils/collateralSwap')
const { isArbiter } = require('../../../utils/env')
const { getMarketModels } = require('../utils/models')
const clients = require('../../../utils/clients')

const web3 = require('web3')
const { toWei, hexToNumber } = web3.utils

function defineSalesInitJobs (agenda) {
  agenda.define('init-liquidation', async (job, done) => {

    // THIS JOB IS ONLY DONE BY THE LENDER AGENT

    console.log('init-liquidation')

    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    const { loanId, principal, collateral } = loan

    const { market } = await getMarketModels(principal, collateral)
    const { rate } = market

    const loans = getObject('loans', principal)
    const sales = getObject('sales', principal)

    const next = await sales.methods.next(numToBytes32(loanId)).call()
    const saleIndexByLoan = next - 1
    const saleIdBytes32 = await sales.methods.saleIndexByLoan(numToBytes32(loanId), saleIndexByLoan).call()
    const saleId = hexToNumber(saleIdBytes32)

    const swapParams = await getInitArgs(numToBytes32(loanId), numToBytes32(saleId), principal, collateral)
    const initAddresses = await loan.collateralClient().loan.collateralSwap.getInitAddresses(...swapParams)

    const lockArgs = await getLockArgs(numToBytes32(loanId), principal, collateral)
    const lockAddresses = await loan.collateralClient().loan.collateral.getLockAddresses(...lockArgs)
    const { refundableAddress, seizableAddress } = lockAddresses
    const newCollateralAmounts = await getCollateralAmounts(numToBytes32(loanId), loan, rate)
    const { refundableCollateral: collateralSwapRefundableAmount, seizableCollateral: collateralSwapSeizableAmount } = newCollateralAmounts

    const refundableUnspent = await loan.collateralClient().getMethod('getUnspentTransactions')([lockAddresses.refundableAddress])

    if (refundableUnspent.length > 0) {
      const lockTxHash = refundableUnspent[0].txid
      const outputs = [{ address: initAddresses.refundableAddress }, { address: initAddresses.seizableAddress }]
      const party = isArbiter() ? 'arbiter' : 'lender'

      const exampleRSSigValue = '0000000000000000000000000000000000000000000000000000000000000000'
      const exampleSig = `30440220${exampleRSSigValue}0220${exampleRSSigValue}01`

      const multisigParams = [lockTxHash, ...lockArgs, party, outputs]
      const agentSigs = await loan.collateralClient().loan.collateral.multisigSign(...multisigParams)

      const sigs = {
        refundable: [Buffer.from(agentSigs.refundableSig, 'hex'), Buffer.from(exampleSig, 'hex')],
        seizable: [Buffer.from(agentSigs.seizableSig, 'hex'), Buffer.from(exampleSig, 'hex')]
      }

      const multisigSendRawTx = await loan.collateralClient().loan.collateral.multisigBuild(lockTxHash, sigs, ...lockArgs, outputs)

      console.log('multisigSendRawTx', multisigSendRawTx)
    }
    done()
  })
}

module.exports = {
  defineSalesInitJobs
}
