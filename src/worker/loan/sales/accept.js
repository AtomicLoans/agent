const { ensure0x } = require('@liquality/ethereum-utils')
const log = require('@mblackmblack/node-pretty-log')

const Loan = require('../../../models/Loan')
const Sale = require('../../../models/Sale')
const LoanMarket = require('../../../models/LoanMarket')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { setTxParams, sendTransaction } = require('../utils/web3Transaction')
const handleError = require('../../../utils/handleError')
const getMailer = require('../utils/mailer')

function defineSalesAcceptJobs (agenda) {
  agenda.define('accept-sale', async (job, done) => {
    const { data } = job.attrs
    const { saleModelId } = data

    log('info', `Accept Sale Job | Sale Model ID: ${saleModelId} | Starting`)

    const sale = await Sale.findOne({ _id: saleModelId }).exec()
    if (!sale) return log('error', `Accept Sale Job | Fund not found with Fund Model ID: ${saleModelId}`)

    const { claimTxHash, saleId, principal } = sale
    const sales = getObject('sales', principal)
    const { accepted, off } = await sales.methods.sales(numToBytes32(saleId)).call()

    if (accepted === true) {
      sale.status = 'ACCEPTED'
      await sale.save()
      log('info', `Accept Sale Job | Sale Model ID: ${saleModelId} | Sale was already accepted`)
      done()
    } else if (off === true) {
      const { collateralSwapRefundableP2SHAddress, collateralSwapSeizableP2SHAddress } = sale

      const collateralSwapBalance = await sale.collateralClient().chain.getBalance([collateralSwapRefundableP2SHAddress, collateralSwapSeizableP2SHAddress])

      if (collateralSwapBalance.toNumber() === 0) {
        sale.status = 'COLLATERAL_REVERTED'
        await sale.save()
        log('info', `Accept Sale Job | Sale Model ID: ${saleModelId} | Collateral already reverted`)
        done()
      } else {
        log('info', `Accept Sale Job | Sale Model ID: ${saleModelId} | Collateral needs to be reverted`)
        // TODO: revert liquidation
      }
    } else {
      const claimTx = await sale.collateralClient().getMethod('getTransactionByHash')(claimTxHash)
      const claimArgs = claimTx._raw.vin[0].txinwitness

      const secretB = claimArgs[4]
      const secretC = claimArgs[3]
      const secretD = claimArgs[2]

      log('info', `Accept Sale Job | Sale Model ID: ${saleModelId} | Accepting Sale #${saleId} with Secret B ${secretB}, Secret C ${secretC}, Secret D ${secretD}`)

      const txData = sales.methods.provideSecretsAndAccept(numToBytes32(saleId), [ensure0x(secretB), ensure0x(secretC), ensure0x(secretD)]).encodeABI()

      const loanMarket = await LoanMarket.findOne({ principal }).exec()
      const { principalAddress } = await loanMarket.getAgentAddresses()

      const ethTx = await setTxParams(txData, ensure0x(principalAddress), getContract('sales', principal), sale)
      await sendTransaction(ethTx, sale, agenda, done, txSuccess, txFailure)
    }
  })
}

async function verifySuccess (instance, agenda, _) {
  const mailer = getMailer(agenda)
  const sale = instance

  log('success', `Verify Accept Sale Job | Sale Model ID: ${sale.id} | Tx confirmed and Fund #${sale.saleId} Created | TxHash: ${sale.acceptTxHash}`)

  sale.status = 'ACCEPTED'
  await sale.save()

  const loan = await Loan.findOne({ _id: sale.loanModelId }).exec()
  if (!loan) return log('error', `Verify Accept Sale Job | Loan not found with Loan Model ID: ${sale.loanModelId}`)

  mailer.notify(loan.borrowerPrincipalAddress, 'loan-liquidated', {
    loanId: loan.loanId,
    asset: loan.principal
  })

  loan.status = 'LIQUIDATED'
  await loan.save()
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const sale = instance

  sale.ethTxId = ethTx.id
  sale.acceptTxHash = transactionHash
  sale.status = 'ACCEPTING'
  log('success', `Accept Sale Job | Sale Model ID: ${sale.id} | Create Tx created successfully | TxHash: ${sale.acceptTxHash}`)
  await sale.save()
  await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-accept-sale', {
    jobName: 'accept',
    modelName: 'Sale',
    modelId: sale.id,
    txHashName: 'acceptTxHash'
  })
}

async function txFailure (error, instance, ethTx) {
  const accept = instance

  log('error', `Accept Sale Job | EthTx Model ID: ${ethTx.id} | Tx create failed`)

  accept.status = 'FAILED'
  await accept.save()

  handleError(error)
}

module.exports = {
  defineSalesAcceptJobs,
  txSuccess,
  txFailure,
  verifySuccess
}
