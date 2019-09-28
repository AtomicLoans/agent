const { ensure0x, remove0x } = require('@liquality/ethereum-utils')
const date = require('date.js')
const Loan = require('../../../models/Loan')
const LoanMarket = require('../../../models/LoanMarket')
const EthTx = require('../../../models/EthTx')
const Secret = require('../../../models/Secret')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { setTxParams, bumpTxFee } = require('../utils/web3Transaction')
const { isArbiter } = require('../../../utils/env')
const web3 = require('../../../utils/web3')

function defineLoanAcceptOrCancelJobs (agenda) {
  agenda.define('accept-or-cancel-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')

    const { loanId, principal, lenderPrincipalAddress, lenderSecrets } = loan
    const loans = getObject('loans', principal)
    const { off } = await loans.methods.bools(numToBytes32(loanId)).call()

    const loanMarket = await LoanMarket.findOne({ principal }).exec()
    const { principalAddress } = await loanMarket.getAgentAddresses()

    if (off) {
      console.log('Loan already accepted')
      done()
    } else {
      let txData
      if (isArbiter()) {
        const { secretHashC1 } = await loans.methods.secretHashes(numToBytes32(loanId)).call()

        const secretModel = await Secret.findOne({ secretHash: remove0x(secretHashC1) })

        txData = loans.methods.accept(numToBytes32(loanId), ensure0x(secretModel.secret)).encodeABI()
      } else {
        txData = loans.methods.accept(numToBytes32(loanId), ensure0x(lenderSecrets[0])).encodeABI()
      }
      const ethTx = await setTxParams(txData, ensure0x(principalAddress), getContract('loans', principal), loan)
      await acceptOrCancelLoan(ethTx, loan, agenda, done)
    }
  })

  agenda.define('verify-accept-or-cancel-loan-ish', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')
    const { acceptOrCancelTxHash } = loan

    const receipt = await web3().eth.getTransactionReceipt(acceptOrCancelTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: loan.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && loan.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await acceptOrCancelLoan(ethTx, loan, agenda, done)
      } else {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-accept-or-cancel-loan-ish', { loanModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      const { principal, loanId } = loan
      const loans = getObject('loans', principal)
      const paid = await loans.methods.paid(numToBytes32(loanId)).call()

      if (paid) {
        console.log('ACCEPTED')
        loan.status = 'ACCEPTED'
        await loan.save()
      } else {
        console.log('CANCELLED')
        loan.status = 'CANCELLED'
        await loan.save()
      }
    }

    done()
  })
}

async function acceptOrCancelLoan (ethTx, loan, agenda, done) {
  web3().eth.sendTransaction(ethTx.json())
    .on('transactionHash', async (transactionHash) => {
      const { principal, loanId } = loan
      const loans = getObject('loans', principal)
      const paid = await loans.methods.paid(numToBytes32(loanId)).call()
      loan.ethTxId = ethTx.id
      loan.acceptOrCancelTxHash = transactionHash
      if (paid) {
        loan.status = 'ACCEPTING'
        console.log('ACCEPTING')
      } else {
        loan.status = 'CANCELLING'
        console.log('CANCELLING')
      }
      await loan.save()
      await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-accept-or-cancel-loan-ish', { loanModelId: loan.id })
      done()
    })
    .on('error', (error) => {
      console.log(error)
      done()
    })
}

module.exports = {
  defineLoanAcceptOrCancelJobs
}
