const keccak256 = require('keccak256')
const { ensure0x } = require('@liquality/ethereum-utils')

const Approve = require('../../../models/Approve')
const Fund = require('../../../models/Fund')
const EthTx = require('../../../models/EthTx')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { setTxParams, bumpTxFee } = require('../utils/web3Transaction')
const { getFundParams } = require('../utils/fundParams')
const web3 = require('../../../utils/web3')
const { hexToNumber } = web3().utils

const date = require('date.js')

function defineFundCreateJobs (agenda) {
  agenda.define('create-fund-ish', async (job, done) => {
    console.log('create-fund')
    const { data } = job.attrs
    const { fundModelId } = data

    const fund = await Fund.findOne({ _id: fundModelId }).exec()
    if (!fund) return console.log('Error: Fund not found')

    const { principal, custom } = fund

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

      const ethTx = await setTxParams(txData, lenderAddress, getContract('funds', principal), fund)

      fund.ethTxId = ethTx.id
      await fund.save()

      await createFund(ethTx, fund, agenda, done)
    } else {
      console.log('Rescheduling fund create because erc20 approve hasn\'t finished')

      fund.status = 'WAITING_FOR_APPROVE'
      await fund.save()
    }
    done()
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

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && fund.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await createFund(ethTx, fund, agenda, done)
      } else {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-create-fund', { fundModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
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
  console.log('createFund')
  try {
    web3().eth.sendTransaction(ethTx.json())
      .on('transactionHash', async (transactionHash) => {
        console.log('transactionHash', transactionHash)
        fund.ethTxId = ethTx.id
        fund.createTxHash = transactionHash
        fund.status = 'CREATING'
        await fund.save()
        console.log(`${fund.principal} FUND CREATING`)
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-create-fund', { fundModelId: fund.id })
        done()
      })
      .on('error', async (error) => {
        console.log(`${fund.principal} FUND CREATION FAILED`)
        console.log(error)
        if (error.indexOf('nonce too low') >= 0) {
          ethTx.nonce = ethTx.nonce + 1
          await ethTx.save()
          await createFund(ethTx, fund, agenda, done)
        } else {
          fund.status = 'FAILED'
          await fund.save()
          done(error)
        }
      })
  } catch (e) {
    console.log(e)
    console.log('ERROR')
  }
}

module.exports = {
  defineFundCreateJobs
}
