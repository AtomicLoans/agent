const { ensure0x } = require('@liquality/ethereum-utils')
const date = require('date.js')
const Loan = require('../../../models/Loan')
const EthTx = require('../../../models/EthTx')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject } = require('../../../utils/contracts')
const { setTxParams, bumpTxFee } = require('../utils/web3Transaction')
const web3 = require('../../../utils/web3')

function defineLoanAcceptOrCancelJobs (agenda) {
  agenda.define('accept-or-cancel-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')

    const { loanId, principal, lenderPrincipalAddress, lenderSecrets } = loan
    const loans = await getObject('loans', principal)

    const txData = loans.methods.accept(numToBytes32(loanId), ensure0x(lenderSecrets[0])).encodeABI()
    const ethTx = await setTxParams(txData, ensure0x(lenderPrincipalAddress), process.env[`${principal}_LOAN_LOANS_ADDRESS`], loan)
    await acceptOrCancelLoan(ethTx, loan, agenda, done)
  })

  agenda.define('verify-accept-or-cancel-loan', async (job, done) => {
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

      if (date(process.env.BUMP_TX_INTERVAL) > ethTx.updatedAt && loan.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await acceptOrCancelLoan(ethTx, loan, agenda, done)
      } else {
        await agenda.schedule(process.env.CHECK_TX_INTERVAL, 'verify-accept-or-cancel-loan', { loanModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      const { principal, loanId } = loan
      const loans = await getObject('loans', principal)
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
  })
}

async function acceptOrCancelLoan (ethTx, loan, agenda, done) {
  web3().eth.sendTransaction(ethTx.json())
    .on('transactionHash', async (transactionHash) => {
      const { principal, loanId } = loan
      const loans = await getObject('loans', principal)
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
      await agenda.schedule(process.env.CHECK_TX_INTERVAL, 'verify-accept-or-cancel-loan', { loanModelId: loan.id })
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
