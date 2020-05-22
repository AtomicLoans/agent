const { ensure0x } = require('@liquality/ethereum-utils')
const log = require('@mblackmblack/node-pretty-log')

const Loan = require('../../../models/Loan')
const LoanMarket = require('../../../models/LoanMarket')
const HotColdWalletProxy = require('../../../models/HotColdWalletProxy')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject, getContract } = require('../../../utils/contracts')
const { isProxyEnabled } = require('../../../utils/env')
const { getInterval } = require('../../../utils/intervals')
const { setTxParams, sendTransaction } = require('../utils/web3Transaction')
const handleError = require('../../../utils/handleError')

function defineLoanApproveJobs (agenda) {
  agenda.define('approve-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    log('info', `Approve Loan Job | Loan Model ID: ${loanModelId} | Starting`)

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return log('error', `Approve Loan Job | Loan not found with Loan Model ID: ${loanModelId}`)

    const { loanId, principal, collateral, lenderPrincipalAddress } = loan

    const loanMarket = await LoanMarket.findOne({ principal, collateral }).exec()
    if (!loanMarket) return log('error', `Request Loan Job | Loan Market not found with principal: ${principal}`)
    const { principalAgentAddress } = await loanMarket.getAgentAddresses()

    const loans = getObject('loans', principal)
    const approved = await loans.methods.approved(numToBytes32(loanId)).call()

    if (approved === true) {
      log('warn', `Approve Loan Job | Loan Model ID: ${loanModelId} | Loan already approved`)
      done()
    } else {
      const txData = loans.methods.approve(numToBytes32(loanId)).encodeABI()

      let ethTx
      if (isProxyEnabled()) {
        const hotColdWalletProxy = await HotColdWalletProxy.findOne({ principal, collateral }).exec()
        const { contractAddress } = hotColdWalletProxy

        const proxy = getObject('hotcoldwallet', contractAddress)
        const proxyTxData = proxy.methods.callLoans(txData).encodeABI()

        ethTx = await setTxParams(proxyTxData, ensure0x(principalAgentAddress), contractAddress, loan)
      } else {
        ethTx = await setTxParams(txData, ensure0x(lenderPrincipalAddress), getContract('loans', principal), loan)
      }

      await ethTx.save()

      await sendTransaction(ethTx, loan, agenda, done, txSuccess, txFailure)
    }
  })
}

async function verifySuccess (instance) {
  const loan = instance

  const { principal, loanId } = loan
  const loans = getObject('loans', principal)
  const approved = await loans.methods.approved(numToBytes32(loanId)).call()

  if (approved) {
    log('success', `Approve Loan Job | Loan Model ID: ${loan.id} | Tx confirmed and Loan #${loan.loanId} Approved | TxHash: ${loan.approveTxHash}`)
    loan.status = 'APPROVED'
    await loan.save()
  } else {
    log('error', `Approve Loan Job | Loan Model ID: ${loan.id} | Tx confirmed but Loan #${loan.loanId} was not Approved | TxHash: ${loan.approveTxHash}`)
  }
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const loan = instance

  loan.ethTxId = ethTx.id
  loan.approveTxHash = transactionHash
  loan.status = 'APPROVING'
  loan.save()
  log('success', `Approve Job | Loan Model ID: ${loan.id} | Approve Tx created successfully | TxHash: ${transactionHash}`)
  await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-approve-loan', {
    jobName: 'approve',
    modelName: 'Loan',
    modelId: loan.id,
    txHashName: 'approveTxHash'
  })
}

async function txFailure (error, instance, ethTx) {
  const loan = instance

  log('error', `Approve Loan Job | EthTx Model ID: ${ethTx.id} | Tx create failed`)

  loan.status = 'FAILED'
  await loan.save()

  handleError(error)
}

module.exports = {
  defineLoanApproveJobs,
  txSuccess,
  txFailure,
  verifySuccess
}
