const keccak256 = require('keccak256')
const { ensure0x } = require('@liquality/ethereum-utils')
const log = require('@mblackmblack/node-pretty-log')

const Approve = require('../../../models/Approve')
const Fund = require('../../../models/Fund')
const LoanMarket = require('../../../models/LoanMarket')
const HotColdWalletProxy = require('../../../models/HotColdWalletProxy')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { setTxParams, sendTransaction } = require('../utils/web3Transaction')
const { getFundParams } = require('../utils/fundParams')
const { isProxyEnabled } = require('../../../utils/env')
const handleError = require('../../../utils/handleError')
const web3 = require('../../../utils/web3')
const { hexToNumber } = web3().utils

function defineFundCreateJobs (agenda) {
  agenda.define('create-fund', async (job, done) => {
    const { data } = job.attrs
    const { fundModelId } = data
    log('info', `Create Fund Job | Fund Model ID: ${fundModelId} | Starting`)

    const fund = await Fund.findOne({ _id: fundModelId }).exec()
    if (!fund) return log('error', `Create Fund Job | Fund not found with Fund Model ID: ${fundModelId}`)
    const { principal, collateral, custom } = fund

    const loanMarket = await LoanMarket.findOne({ principal, collateral }).exec()
    if (!loanMarket) return log('error', `Request Loan Job | Loan Market not found with principal: ${principal}`)
    const { principalAgentAddress } = await loanMarket.getAgentAddresses()

    const approves = await Approve.find({ principal, status: { $nin: ['FAILED'] } }).exec()

    if (approves.length > 0) {
      const funds = getObject('funds', principal)
      const { fundParams, lenderAddress } = await getFundParams(fund)

      let txData
      if (custom) {
        txData = funds.methods.createCustom(...fundParams).encodeABI()
      } else {
        txData = funds.methods.create(...fundParams).encodeABI()
      }

      let ethTx
      if (isProxyEnabled()) {
        const hotColdWalletProxy = await HotColdWalletProxy.findOne({ principal, collateral }).exec()
        const { contractAddress } = hotColdWalletProxy

        const proxy = getObject('hotcoldwallet', contractAddress)
        const proxyTxData = proxy.methods.callFunds(txData).encodeABI()

        ethTx = await setTxParams(proxyTxData, ensure0x(principalAgentAddress), contractAddress, fund)
      } else {
        ethTx = await setTxParams(txData, lenderAddress, getContract('funds', principal), fund)
      }

      fund.ethTxId = ethTx.id
      await fund.save()

      await sendTransaction(ethTx, fund, agenda, done, txSuccess, txFailure)
    } else {
      log('info', `Create Fund Job | Fund Model ID: ${fundModelId} | Rescheduling Create Fund because ERC20 Approve hasn't finished`)

      fund.status = 'WAITING_FOR_APPROVE'
      await fund.save()
    }
  })
}

async function verifySuccess (instance, _, receipt) {
  const fund = instance

  const fundCreateLog = receipt.logs.filter(log => log.topics[0] === ensure0x(keccak256('Create(bytes32)').toString('hex')))

  if (fundCreateLog.length > 0) {
    const { data: fundId } = fundCreateLog[0]

    fund.fundId = hexToNumber(fundId)
    fund.status = 'CREATED'
    fund.save()
    log('success', `Verify Create Fund Job | Fund Model ID: ${fund.id} | Tx confirmed and Fund #${fund.fundId} Created | TxHash: ${fund.createTxHash}`)
  } else {
    log('error', `Verify Create Fund Job | Fund Model ID: ${fund.id} | Tx confirmed but Fund Id could not be found in transaction logs | TxHash: ${fund.createTxHash}`)
  }
}

async function txSuccess (transactionHash, ethTx, instance, agenda) {
  const fund = instance

  fund.ethTxId = ethTx.id
  fund.createTxHash = transactionHash
  fund.status = 'CREATING'
  await fund.save()
  log('success', `Create Fund Job | Fund Model ID: ${fund.id} | Create Tx created successfully | TxHash: ${transactionHash}`)
  await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-create-fund', {
    jobName: 'create',
    modelName: 'Fund',
    modelId: fund.id,
    txHashName: 'createTxHash'
  })
}

async function txFailure (error, instance, ethTx) {
  const fund = instance

  log('error', `Create Fund Job | EthTx Model ID: ${ethTx.id} | Tx create failed`)

  fund.status = 'FAILED'
  await fund.save()

  handleError(error)
}

module.exports = {
  defineFundCreateJobs,
  txSuccess,
  txFailure,
  verifySuccess
}
