const Loan = require('../../../models/Loan')
const EthTx = require('../../../models/EthTx')
const { numToBytes32 } = require('../../../utils/finance')
const { loadObject } = require('../../../utils/contracts')
const { ensure0x } = require('@liquality/ethereum-utils')
const keccak256 = require('keccak256')
const { currencies } = require('../../../utils/fx')
const clients = require('../../../utils/clients')
const BN = require('bignumber.js')
const { getMarketModels } = require('../utils/models')
const { getLockArgs, getCollateralAmounts } = require('../utils/collateral')
const { setTxParams, bumpTxFee } = require('../utils/web3Transaction')
const web3 = require('../../../utils/web3')
const { hexToNumber } = web3().utils
const date = require('date.js')

function defineLoanRequestJobs (agenda) {
  agenda.define('request-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')
    const {
      principal, collateral, principalAmount, collateralAmount, borrowerPrincipalAddress, borrowerSecretHashes, lenderSecretHashes,
      lenderPrincipalAddress, requestLoanDuration, borrowerCollateralPublicKey, lenderCollateralPublicKey, requestCreatedAt
    } = loan

    const funds = await loadObject('funds', process.env[`${principal}_LOAN_FUNDS_ADDRESS`])

    const fundId = await funds.methods.fundOwner(ensure0x(lenderPrincipalAddress)).call()

    const loanParams = [
      fundId,
      ensure0x(borrowerPrincipalAddress),
      BN(principalAmount).times(currencies[principal].multiplier).toFixed(),
      BN(collateralAmount).times(currencies[collateral].multiplier).toFixed(),
      requestLoanDuration,
      requestCreatedAt,
      borrowerSecretHashes.concat(lenderSecretHashes).map(secretHashes => ensure0x(secretHashes)),
      ensure0x(borrowerCollateralPublicKey),
      ensure0x(lenderCollateralPublicKey)
    ]

    const txData = funds.methods.request(...loanParams).encodeABI()

    const ethTx = await setTxParams(txData, ensure0x(lenderPrincipalAddress), process.env[`${principal}_LOAN_FUNDS_ADDRESS`], loan)

    await requestLoan(ethTx, loan, agenda, done)
  })

  agenda.define('verify-request-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')
    const { loanRequestTxHash } = loan

    console.log('CHECKING LOAN REQUEST RECEIPT')

    const receipt = await web3().eth.getTransactionReceipt(loanRequestTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: loan.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(process.env.BUMP_TX_INTERVAL) > ethTx.updatedAt && loan.status !== 'FAILED') {
        console.log('BUMPING TX FEE')
        await bumpTxFee(ethTx)
        await requestLoan(ethTx, loan, agenda, done)
      } else {
        await agenda.schedule(process.env.CHECK_TX_INTERVAL, 'verify-request-loan', { loanModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      const { principal, collateral } = loan
      const { market } = await getMarketModels(principal, collateral)
      const { rate } = market

      const loanCreateLog = receipt.logs.filter(log => log.topics[0] === ensure0x(keccak256('Create(bytes32)').toString('hex')))

      if (loanCreateLog.length > 0) {
        const { data: loanId } = loanCreateLog[0]

        const lockArgs = await getLockArgs(numToBytes32(loanId), principal, collateral)
        const addresses = await clients[collateral].loan.collateral.getLockAddresses(...lockArgs)
        const amounts = await getCollateralAmounts(numToBytes32(loanId), loan, rate)

        loan.setCollateralAddressValues(addresses, amounts)
        loan.loanId = hexToNumber(loanId)
        loan.status = 'AWAITING_COLLATERAL'
        console.log(`${loan.principal} LOAN #${loan.loanId} CREATED/REQUESTED`)
        console.log('AWAITING_COLLATERAL')
        loan.save()

        await agenda.now('verify-lock-collateral', { loanModelId: loan.id })

        done()
      } else {
        console.error('Error: Loan Id could not be found in transaction logs')
      }
    }
  })
}

async function requestLoan (ethTx, loan, agenda, done) {
  web3().eth.sendTransaction(ethTx.json())
    .on('transactionHash', async (transactionHash) => {
      loan.ethTxId = ethTx.id
      loan.loanRequestTxHash = transactionHash
      loan.status = 'REQUESTING'
      loan.save()
      console.log('LOAN REQUESTING')
      await agenda.now('verify-request-loan', { loanModelId: loan.id })
      done()
    })
    .on('error', (error) => {
      console.log(error)
      done()
    })
}

module.exports = {
  defineLoanRequestJobs
}