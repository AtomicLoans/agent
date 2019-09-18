const axios = require('axios')
const keccak256 = require('keccak256')
const { ensure0x } = require('@liquality/ethereum-utils')

const Fund = require('../../models/Fund')
const EthTransaction = require('../../models/EthTransaction')
const { rateToSec } = require('../../utils/finance')
const { loadObject } = require('../../utils/contracts')
const { currencies } = require('../../utils/fx')
const { getMarketModels } = require('./utils/models')
const { setTxParams } = require('./utils/web3Transaction')
const { getFundParams } = require('./utils/fundParams')
const web3 = require('../../utils/web3')
const { toWei, hexToNumber } = web3().utils

function defineFundsJobs (agenda) {
  agenda.define('create-fund', async (job, done) => {
    console.log('JOB create-fund')

    const { data } = job.attrs
    const { requestId } = data

    const fund = await Fund.findOne({ _id: requestId }).exec()
    if (!fund) return console.log('Error: Fund not found')

    console.log('fund', fund)

    const { principal, custom } = fund
    const fundContractAddress = process.env[`${principal}_LOAN_FUNDS_ADDRESS`]
    const funds = await loadObject('funds', fundContractAddress)
    const { fundParams, lenderAddress } = await getFundParams(fund)

    let txData
    if (custom) {
      txData = funds.methods.createCustom(...fundParams).encodeABI()
    } else {
      txData = funds.methods.create(...fundParams).encodeABI()
    }

    const ethTransaction = await setTxParams(txData, lenderAddress, fundContractAddress, fund)

    fund.ethTransactionId = ethTransaction.id
    await fund.save()

    await agenda.schedule(process.env.CHECK_TX_INTERVAL, 'verify-create-fund', { fundId: fund.id })

    const testing = process.env.NODE_ENV === 'test' && process.env.TEST_TX_OVERWRITE
    if (testing === true) { return } // Don't create fund if testing tx overwrite flow

    await createFund(ethTransaction.json(), fund, agenda, done)
  })

  agenda.define('verify-create-fund', async (job, done) => {
    const { data } = job.attrs
    const { ethTransactionId, fundId } = data

    console.log('VERIFY CREATE FUND')

    const fund = await Fund.findOne({ _id: fundId }).exec()
    if (!fund) return console.log('Error: Fund not found')

    if (fund.status === 'CREATING' || fund.status === 'INITIATED') {
      const ethTransaction = await EthTransaction.findOne({ _id: fund.ethTransactionId })
      if (!ethTransaction) return console.log('Error: EthTransaction not found')

      const { gasPrice: currentGasPrice } = ethTransaction

      let fastPriceInWei
      try {
        const { data: gasPricesFromOracle } = await axios(`https://www.etherchain.org/api/gasPriceOracle`)
        const { fast } = gasPricesFromOracle
        fastPriceInWei = parseInt(toWei(fast, 'gwei'))
      } catch(e) {
        fastPriceInWei = currentGasPrice
      }
      
      if (fastPriceInWei > (currentGasPrice * 1.1)) {
        ethTransaction.gasPrice = Math.ceil(fastPriceInWei)
      } else {
        ethTransaction.gasPrice = Math.ceil(currentGasPrice * 1.15)
      }

      await ethTransaction.save()

      await agenda.schedule(process.env.CHECK_TX_INTERVAL, 'verify-create-fund', { fundId: fund.id })

      console.log('BUMPING TX FEE')

      await createFund(ethTransaction.json(), fund, agenda, done)
    }
  })

  agenda.define('check-tx', async (job, done) => {
    const { data } = job.attrs
    const { transactionHash } = data

    console.log('CHECKING RECEIPT')

    const receipt = await web3().eth.getTransactionReceipt(transactionHash)
    console.log('receipt', receipt)

    done()
  })
}

async function createFund (txParams, fund, agenda, done) {
  web3().eth.sendTransaction(txParams)
  .on('transactionHash', async (transactionHash) => {
    fund.fundCreateTxHash = transactionHash
    fund.status = 'CREATING'
    fund.save()
    console.log('FUND CREATING')
    await agenda.now('check-tx', { transactionHash })
  })
  .on('confirmation', async (confirmationNumber, receipt) => {
    const { principal, collateral } = fund
    const { loanMarket } = await getMarketModels(principal, collateral)
    const { minConf } = loanMarket

    if (confirmationNumber === minConf) {
      const fundCreateLog = receipt.logs.filter(log => log.topics[0] === ensure0x(keccak256('Create(bytes32)').toString('hex')))

      if (fundCreateLog.length > 0) {
        const { data: fundId } = fundCreateLog[0]

        fund.fundId = hexToNumber(fundId)
        fund.status = 'CREATED'
        fund.save()
        console.log('FUND CREATED')
        done()
      } else {
        console.error('Error: Fund Id could not be found in transaction logs')
      }
    }
  })
  .on('error', (error) => {
    console.log('FUND CREATION FAILED')
    fund.status = 'FAILED'
    fund.save()
    done(error)
  })
}

module.exports = {
  defineFundsJobs
}
