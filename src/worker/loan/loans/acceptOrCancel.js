const { ensure0x, remove0x } = require('@liquality/ethereum-utils')
const axios = require('axios')
const log = require('@mblackmblack/node-pretty-log')

const Agent = require('../../../models/Agent')
const Loan = require('../../../models/Loan')
const LoanMarket = require('../../../models/LoanMarket')
const Secret = require('../../../models/Secret')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { setTxParams, sendTransaction } = require('../utils/web3Transaction')
const { isArbiter } = require('../../../utils/env')
const handleError = require('../../../utils/handleError')

function defineLoanAcceptOrCancelJobs (agenda) {
  // accept-or-cancel-loan is a job that spins up a
  // accept or cancel Ethereum transaction which reveals a secret
  // allowing the borrower to reclaim their Bitcoin collateral
  //
  // Note: can be initiated by Lender or Arbiter
  agenda.define('accept-or-cancel-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    log('info', `Accept Or Cancel Loan Job | Loan Model ID: ${loanModelId} | Starting`)

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return log('error', `Accept Or Cancel Loan Job | Loan not found with Loan Model ID: ${loanModelId}`)

    const { loanId, principal, lenderSecrets } = loan
    const loans = getObject('loans', principal)
    const { off } = await loans.methods.bools(numToBytes32(loanId)).call()

    const loanMarket = await LoanMarket.findOne({ principal }).exec()
    const { principalAddress } = await loanMarket.getAgentAddresses()

    if (off === true) {
      log('info', `Accept Or Cancel Loan Job | Loan Model ID: ${loanModelId} | Loan already accepted`)
    } else {
      // If the current PARTY is Arbiter, check if lender agent is already accepting, if not accept the loan
      // Else if Lender, just accept the loan
      let lenderAccepting = false
      if (isArbiter()) {
        const { lender } = await loans.methods.loans(numToBytes32(loanId)).call()
        const agent = await Agent.findOne({ principalAddress: lender }).exec()
        if (agent) {
          try {
            const { status, data } = await axios.get(`${agent.url}/loans/contract/${principal}/${loanId}`)
            log('info', `Accept Or Cancel Loan Job | Loan Model ID: ${loanModelId} | ${agent.url} status: ${status}`)
            if (status === 200) {
              const { acceptOrCancelTxHash } = data
              if (acceptOrCancelTxHash) {
                lenderAccepting = true
              }
            }
          } catch (e) {
            log('error', `Accept Or Cancel Loan Job | Loan Model ID: ${loanModelId} | Agent ${agent.url} not active`)
          }
        }
      }

      if (!isArbiter() || !lenderAccepting) {
        let txData
        if (isArbiter()) {
          const { secretHashC1 } = await loans.methods.secretHashes(numToBytes32(loanId)).call()

          const secretModel = await Secret.findOne({ secretHash: remove0x(secretHashC1) })

          txData = loans.methods.accept(numToBytes32(loanId), ensure0x(secretModel.secret)).encodeABI()
        } else {
          txData = loans.methods.accept(numToBytes32(loanId), ensure0x(lenderSecrets[0])).encodeABI()
        }
        const ethTx = await setTxParams(txData, ensure0x(principalAddress), getContract('loans', principal), loan)
        await sendTransaction(ethTx, loan, agenda, done, txSuccess, txFailure)
      }
    }
    done()
  })
}

async function verifySuccess (instance, agenda, _) {
  const loan = instance

  const { principal, loanId } = loan
  const loans = getObject('loans', principal)
  const { paid } = await loans.methods.bools(numToBytes32(loanId)).call()

  if (paid) {
    log('success', `Verify Accept Or Cancel Loan Job | Loan Model ID: ${loan.id} | Loan #${loanId} Accepted | TxHash: ${loan.acceptOrCancelTxHash}`)
    loan.status = 'ACCEPTED'

    await loan.save()
  } else {
    log('success', `Verify Accept Or Cancel Loan Job | Loan Model ID: ${loan.id} | Loan #${loanId} Cancelled | TxHash: ${loan.acceptOrCancelTxHash}`)
    loan.status = 'CANCELLED'

    await loan.save()
  }
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const loan = instance

  const { principal, loanId } = loan
  const loans = getObject('loans', principal)
  const paid = await loans.methods.paid(numToBytes32(loanId)).call()
  loan.ethTxId = ethTx.id
  loan.acceptOrCancelTxHash = transactionHash
  if (paid) {
    loan.status = 'ACCEPTING'
    log('success', `Accept Or Cancel Loan Job | Loan Model ID: ${loan.id} | Accept Tx created successfully | TxHash: ${transactionHash}`)
  } else {
    loan.status = 'CANCELLING'
    log('success', `Accept Or Cancel Loan Job | Loan Model ID: ${loan.id} | Cancel Tx created successfully | TxHash: ${transactionHash}`)
  }
  await loan.save()
  await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-accept-or-cancel-loan', {
    jobName: 'accept-or-cancel',
    modelName: 'Loan',
    modelId: loan.id,
    txHashName: 'acceptOrCancelTxHash'
  })
}

async function txFailure (error, instance, ethTx) {
  const loan = instance

  log('error', `Accept Or Cancel Loan Job | EthTx Model ID: ${ethTx.id} | Tx create failed`)
  loan.status = 'FAILED'
  await loan.save()

  handleError(error)
}

module.exports = {
  defineLoanAcceptOrCancelJobs,
  verifySuccess,
  txSuccess,
  txFailure
}
