const axios = require('axios')
const keccak256 = require('keccak256')
const { ensure0x } = require('@liquality/ethereum-utils')

const Fund = require('../../models/Fund')
const EthTx = require('../../models/EthTx')
const { loadObject } = require('../../utils/contracts')
const { setTxParams } = require('./utils/web3Transaction')
const { getFundParams } = require('./utils/fundParams')
const web3 = require('../../utils/web3')
const { toWei, hexToNumber } = web3().utils

const date = require('date.js')

function defineFundsJobs (agenda) {
  agenda.define('create-fund', async (job, done) => {
    const { data } = job.attrs
    const { fundModelId } = data

    const fund = await Fund.findOne({ _id: fundModelId }).exec()
    if (!fund) return console.log('Error: Fund not found')

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

    const ethTx = await setTxParams(txData, lenderAddress, fundContractAddress, fund)

    fund.ethTxId = ethTx.id
    await fund.save()

    await createFund(ethTx, fund, agenda, done)
  })

  agenda.define('verify-create-fund', async (job, done) => {
    const { data } = job.attrs
    const { fundModelId } = data

    const fund = await Fund.findOne({ _id: fundModelId }).exec()
    if (!fund) return console.log('Error: Fund not found')
    const { createTxHash } = fund

    console.log('CHECKING RECEIPT')

    const receipt = await web3().eth.getTransactionReceipt(createTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: fund.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(process.env.BUMP_TX_INTERVAL) > ethTx.updatedAt && fund.status !== 'FAILED') {
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

        await createFund(ethTx, fund, agenda, done)
      } else {
        await agenda.schedule(process.env.CHECK_TX_INTERVAL, 'verify-create-fund', { fundModelId })
      }
    } else {
      console.log('RECEIPT IS NOT NULL')
      const fundCreateLog = receipt.logs.filter(log => log.topics[0] === ensure0x(keccak256('Create(bytes32)').toString('hex')))

      if (fundCreateLog.length > 0) {
        const { data: fundId } = fundCreateLog[0]

        fund.fundId = hexToNumber(fundId)
        fund.status = 'CREATED'
        fund.save()
        console.log(`${fund.principal} FUND #${fund.fundId} CREATED`)
        done()
      } else {
        console.error('Error: Fund Id could not be found in transaction logs')
      }
    }

    done()
  })
}

async function createFund (ethTx, fund, agenda, done) {
  web3().eth.sendTransaction(ethTx.json())
    .on('transactionHash', async (transactionHash) => {
      fund.ethTxId = ethTx.id
      fund.createTxHash = transactionHash
      fund.status = 'CREATING'
      fund.save()
      console.log(`${fund.principal} FUND CREATING`)
      await agenda.now('verify-create-fund', { fundModelId: fund.id })
      done()
    })
    .on('error', (error) => {
      console.log(`${fund.principal} FUND CREATION FAILED`)
      console.log(error)
      fund.status = 'FAILED'
      fund.save()
      done(error)
    })
}

module.exports = {
  defineFundsJobs
}
