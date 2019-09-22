const Loan = require('../../../models/Loan')
const EthTx = require('../../../models/EthTx')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject } = require('../../../utils/contracts')
const { ensure0x } = require('@liquality/ethereum-utils')
const { setTxParams, bumpTxFee } = require('../utils/web3Transaction')
const web3 = require('../../../utils/web3')
const date = require('date.js')

function defineLoanApproveJobs (agenda) {
  agenda.define('approve-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')

    const { loanId, principal, lenderPrincipalAddress } = loan
    const loans = await getObject('loans', principal)
    const approved = await loans.methods.approved(numToBytes32(loanId)).call()

    if (approved) {
      console.log('Loan already approved')
      done()
    } else {
      const txData = loans.methods.approve(numToBytes32(loanId)).encodeABI()
      const ethTx = await setTxParams(txData, ensure0x(lenderPrincipalAddress), process.env[`${principal}_LOAN_LOANS_ADDRESS`], loan)
      await approveLoan(ethTx, loan, agenda, done)
    }
  })

  agenda.define('verify-approve-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')
    const { approveTxHash } = loan

    console.log('CHECKING LOAN APPROVE')

    const receipt = await web3().eth.getTransactionReceipt(approveTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: loan.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(process.env.BUMP_TX_INTERVAL) > ethTx.updatedAt && loan.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await approveLoan(ethTx, loan, agenda, done)
      } else {
        await agenda.schedule(process.env.CHECK_TX_INTERVAL, 'verify-approve-loan', { loanModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      const { principal, loanId } = loan
      const loans = await getObject('loans', principal)
      const approved = await loans.methods.approved(numToBytes32(loanId)).call()

      if (approved) {
        console.log('APPROVED')
        loan.status = 'APPROVED'
        await loan.save()
        await agenda.schedule(process.env.REPAID_TX_INTERVAL, 'check-loan-status', { loanModelId })
        done()
      } else {
        console.log('TX WAS NOT APPROVED')
      }
    }
  })
}

async function approveLoan (ethTx, loan, agenda, done) {
  web3().eth.sendTransaction(ethTx.json())
    .on('transactionHash', async (transactionHash) => {
      loan.ethTxId = ethTx.id
      loan.approveTxHash = transactionHash
      loan.status = 'APPROVING'
      loan.save()
      console.log('APPROVING')
      await agenda.schedule(process.env.CHECK_TX_INTERVAL, 'verify-approve-loan', { loanModelId: loan.id })
      done()
    })
    .on('error', (error) => {
      console.log(error)
      done()
    })
}

module.exports = {
  defineLoanApproveJobs
}