const { ensure0x } = require('@liquality/ethereum-utils')
const log = require('@mblackmblack/node-pretty-log')

const Loan = require('../../../models/Loan')
const Sale = require('../../../models/Sale')
const LoanMarket = require('../../../models/LoanMarket')
const HotColdWalletProxy = require('../../../models/HotColdWalletProxy')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { isProxyEnabled } = require('../../../utils/env')
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

    const { claimTxHash, saleId, principal, collateral } = sale

    const loanMarket = await LoanMarket.findOne({ principal }).exec()
    if (!loanMarket) return log('error', `Accept Sale Job | Loan Market not found with principal: ${principal}`)
    const { principalAddress, principalAgentAddress } = await loanMarket.getAgentAddresses()

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
      }
    } else {
      const claimTx = await sale.collateralClient().getMethod('getTransactionByHash')(claimTxHash)
      const claimArgs = claimTx._raw.vin[0].txinwitness

      const secretB = claimArgs[4]
      const secretC = claimArgs[3]
      const secretD = claimArgs[2]

      log('info', `Accept Sale Job | Sale Model ID: ${saleModelId} | Accepting Sale #${saleId} with Secret B ${secretB}, Secret C ${secretC}, Secret D ${secretD}`)

      const txData = sales.methods.provideSecretsAndAccept(numToBytes32(saleId), [ensure0x(secretB), ensure0x(secretC), ensure0x(secretD)]).encodeABI()

      let ethTx
      if (isProxyEnabled()) {
        const hotColdWalletProxy = await HotColdWalletProxy.findOne({ principal, collateral }).exec()
        const { contractAddress } = hotColdWalletProxy

        const proxy = getObject('hotcoldwallet', contractAddress)
        const proxyTxData = proxy.methods.callSales(txData).encodeABI()

        ethTx = await setTxParams(proxyTxData, ensure0x(principalAgentAddress), contractAddress, sale)
      } else {
        ethTx = await setTxParams(txData, ensure0x(principalAddress), getContract('sales', principal), sale)
      }

      await ethTx.save()

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
  const sale = instance

  const { saleId, principal } = sale

  const sales = getObject('sales', principal)
  const { accepted, off } = await sales.methods.sales(numToBytes32(saleId)).call()

  // Should check if sale was already accepted. Only if not accepted should Sale be marked as fail
  if (accepted === true) {
    sale.status = 'ACCEPTED'
  } else if (off === true) {
    // TODO: check if collateral has actually been reverted
    sale.status = 'COLLATERAL_REVERTED'
  } else {
    log('error', `Accept Sale Job | EthTx Model ID: ${ethTx.id} | Tx create failed`)

    sale.status = 'FAILED'
    await sale.save()

    handleError(error)
  }
}

module.exports = {
  defineSalesAcceptJobs,
  txSuccess,
  txFailure,
  verifySuccess
}
