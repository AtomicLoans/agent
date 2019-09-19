const Loan = require('../../../models/Loan')
const EthTx = require('../../../models/EthTx')
const { numToBytes32 } = require('../../../utils/finance')
const { loadObject } = require('../../../utils/contracts')
const { ensure0x, remove0x } = require('@liquality/ethereum-utils')
const keccak256 = require('keccak256')
const { currencies } = require('../../../utils/fx')
const clients = require('../../../utils/clients')
const BN = require('bignumber.js')
const { getMarketModels } = require('../utils/models')
const { getLockArgs, getCollateralAmounts } = require('../utils/collateral')
const { setTxParams } = require('../utils/web3Transaction')
const web3 = require('../../../utils/web3')
const { fromWei, hexToNumber } = web3().utils

function defineLoanRequestJobs (agenda) {
  agenda.define('request-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')
    const {
      principal, collateral, principalAmount, collateralAmount, borrowerPrincipalAddress, borrowerSecretHashes, lenderSecretHashes,
      lenderPrincipalAddress, requestLoanDuration, borrowerCollateralPublicKey, lenderCollateralPublicKey
    } = loan

    const funds = await loadObject('funds', process.env[`${principal}_LOAN_FUNDS_ADDRESS`])

    const fundId = await funds.methods.fundOwner(ensure0x(lenderPrincipalAddress)).call()

    const loanParams = [
      fundId,
      ensure0x(borrowerPrincipalAddress),
      BN(principalAmount).times(currencies[principal].multiplier).toFixed(),
      BN(collateralAmount).times(currencies[collateral].multiplier).toFixed(),
      requestLoanDuration,
      borrowerSecretHashes.concat(lenderSecretHashes).map(secretHashes => ensure0x(secretHashes)),
      ensure0x(borrowerCollateralPublicKey),
      ensure0x(lenderCollateralPublicKey)
    ]

    const txData = funds.methods.request(...loanParams).encodeABI()

    const ethTx = await setTxParams(txData, ensure0x(lenderPrincipalAddress), process.env[`${principal}_LOAN_FUNDS_ADDRESS`], loan)

    await agenda.schedule('in 2 minutes', 'verify-request-loan', { ethTxId: ethTx.id, loanModelId: loan.id })

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
        const { gasPrice: currentGasPrice } = ethTx
        let fastPriceInWei
        try {
          const { data: gasPricesFromOracle } = await axios(`https://www.etherchain.org/api/gasPriceOracle`)
          const { fast } = gasPricesFromOracle
          fastPriceInWei = parseInt(toWei(fast, 'gwei'))
        } catch (e) {
          fastPriceInWei = currentGasPrice
        }

        if (fastPriceInWei > (currentGasPrice * 1.1)) {
          ethTx.gasPrice = Math.ceil(fastPriceInWei)
        } else {
          ethTx.gasPrice = Math.ceil(currentGasPrice * 1.15)
        }

        await ethTx.save()
        console.log('BUMPING TX FEE')

        await requestLoan(ethTx, loan, agenda, done)
      } else {
        await agenda.schedule(process.env.CHECK_TX_INTERVAL, 'verify-request-loan', { loanModelId })
      }
    } else {
      console.log('RECEIPT IS NOT NULL')

      const { principal, collateral, collateralAmount } = loan
      const { market } = await getMarketModels(principal, collateral)
      const { rate } = market

      const loanCreateLog = receipt.logs.filter(log => log.topics[0] === ensure0x(keccak256('Create(bytes32)').toString('hex')))

      if (loanCreateLog.length > 0) {
        const { data: loanId } = loanCreateLog[0]

        const loans = await loadObject('loans', process.env[`${principal}_LOAN_LOANS_ADDRESS`])

        const lockArgs = await getLockArgs(numToBytes32(loanId), principal, collateral)
        const { refundableAddress, seizableAddress } = await clients[collateral].loan.collateral.getLockAddresses(...lockArgs)
        const { refundableCollateral, seizableCollateral } = await getCollateralAmounts(numToBytes32(loanId), loan, rate)

        loan.refundableCollateralAmount = refundableCollateral
        loan.seizableCollateralAmount = seizableCollateral
        loan.collateralRefundableP2SHAddress = refundableAddress
        loan.collateralSeizableP2SHAddress = seizableAddress
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
