const BN = require('bignumber.js')
const keccak256 = require('keccak256')
const log = require('@mblackmblack/node-pretty-log')
const { ensure0x } = require('@liquality/ethereum-utils')

const Loan = require('../../../models/Loan')
const LoanMarket = require('../../../models/LoanMarket')
const HotColdWalletProxy = require('../../../models/HotColdWalletProxy')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { isProxyEnabled } = require('../../../utils/proxyEnabled')
const { currencies } = require('../../../utils/fx')
const clients = require('../../../utils/clients')
const { getMarketModels } = require('../utils/models')
const { getLockArgs, getCollateralAmounts } = require('../utils/collateral')
const { setTxParams, sendTransaction } = require('../utils/web3Transaction')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')
const { hexToNumber } = web3().utils

function defineLoanRequestJobs (agenda) {
  agenda.define('request-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data
    log('info', `Request Loan Job | Loan Model ID: ${loanModelId} | Starting`)

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return log('error', `Request Loan Job | Loan not found with Loan Model ID: ${loanModelId}`)
    const {
      principal, collateral, principalAmount, collateralAmount, borrowerPrincipalAddress, borrowerSecretHashes, lenderSecretHashes,
      lenderPrincipalAddress, requestLoanDuration, borrowerCollateralPublicKey, lenderCollateralPublicKey, requestCreatedAt
    } = loan

    const loanMarket = await LoanMarket.findOne({ principal, collateral }).exec()
    if (!loanMarket) return log('error', `Request Loan Job | Loan Market not found with principal: ${principal}`)
    const { principalAgentAddress } = await loanMarket.getAgentAddresses()

    const funds = getObject('funds', principal)

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

    let ethTx
    if (isProxyEnabled()) {
      const hotColdWalletProxy = await HotColdWalletProxy.findOne({ principal, collateral }).exec()
      const { contractAddress } = hotColdWalletProxy

      const proxy = getObject('hotcoldwallet', contractAddress)
      const proxyTxData = proxy.methods.funds(txData).encodeABI()

      ethTx = await setTxParams(proxyTxData, ensure0x(principalAgentAddress), contractAddress, loan)
    } else {
      ethTx = await setTxParams(txData, ensure0x(lenderPrincipalAddress), getContract('funds', principal), loan)
    }

    await ethTx.save()

    await sendTransaction(ethTx, loan, agenda, done, txSuccess, txFailure)
  })
}

async function verifySuccess (instance, _, receipt) {
  const loan = instance

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
    log('success', `Verify Request Loan Job | Loan Model ID: ${loan.id} | Tx confirmed and Loan #${loan.loanId} Created | TxHash: ${loan.loanRequestTxHash}`)
    loan.save()
  } else {
    log('error', `Verify Request Loan Job | Loan Model ID: ${loan.id} | Tx confirmed but Loan Id could not be found in transaction logs | TxHash: ${loan.loanRequestTxHash}`)
  }
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const loan = instance

  loan.ethTxId = ethTx.id
  loan.loanRequestTxHash = transactionHash
  loan.status = 'REQUESTING'
  await loan.save()
  log('success', `Request Loan Job | Loan Model ID: ${loan.id} | Request Tx created successfully | TxHash: ${transactionHash}`)
  await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-request-loan', {
    jobName: 'request',
    modelName: 'Loan',
    modelId: loan.id,
    txHashName: 'loanRequestTxHash'
  })
}

async function txFailure (error, instance, ethTx) {
  const loan = instance

  log('error', `Request Loan Job | EthTx Model ID: ${ethTx.id} | Tx create failed`)

  loan.status = 'FAILED'
  await loan.save()

  handleError(error)
}

module.exports = {
  defineLoanRequestJobs,
  txSuccess,
  txFailure,
  verifySuccess
}
