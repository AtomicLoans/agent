const Fund = require('../../../models/Fund')
const EthTx = require('../../../models/EthTx')
const Withdraw = require('../../../models/Withdraw')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { getEthSigner } = require('../../../utils/address')
const { numToBytes32 } = require('../../../utils/finance')
const { currencies } = require('../../../utils/fx')
const { setTxParams, bumpTxFee } = require('../utils/web3Transaction')
const { getFundParams } = require('../utils/fundParams')
const web3 = require('../../../utils/web3')
const { toWei } = web3().utils

const date = require('date.js')

function defineFundWithdrawJobs (agenda) {
  agenda.define('fund-withdraw', async (job, done) => {
    console.log('fund-withdraw')
    const { data } = job.attrs
    const { fundModelId, amountToWithdraw } = data

    const fund = await Fund.findOne({ _id: fundModelId }).exec()
    if (!fund) return console.log('Error: Fund not found')

    const { principal, fundId } = fund
    const unit = currencies[principal].unit
    const funds = getObject('funds', principal)
    const { lenderAddress } = await getFundParams(fund)
    const address = getEthSigner()

    const txData = funds.methods.withdrawTo(numToBytes32(fundId), toWei(amountToWithdraw.toString(), unit), address).encodeABI()

    const ethTx = await setTxParams(txData, lenderAddress, getContract('funds', principal), fund)

    const withdraw = Withdraw.fromTxParams({ fundModelId, fundId, amount: amountToWithdraw, ethTxId: ethTx.id })
    await withdraw.save()

    await withdrawFromFund(ethTx, withdraw, agenda, done)
  })

  agenda.define('verify-fund-withdraw', async (job, done) => {
    const { data } = job.attrs
    const { withdrawModelId } = data

    const withdraw = await Withdraw.findOne({ _id: withdrawModelId }).exec()
    if (!withdraw) return console.log('Error: Withdraw not found')
    const { withdrawTxHash } = withdraw

    console.log('CHECKING RECEIPT')

    const receipt = await web3().eth.getTransactionReceipt(withdrawTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: withdraw.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && withdraw.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await withdrawFromFund(ethTx, withdraw, agenda, done)
      } else {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-fund-withdraw', { withdrawModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      withdraw.status = 'WITHDRAWN'
      await withdraw.save()

      console.log('WITHDRAW SUCCESSFUL')
    }

    done()
  })
}

async function withdrawFromFund (ethTx, withdraw, agenda, done) {
  console.log('withdrawFromFund')
  try {
    web3().eth.sendTransaction(ethTx.json())
      .on('transactionHash', async (transactionHash) => {
        console.log('transactionHash', transactionHash)
        withdraw.withdrawTxHash = transactionHash
        withdraw.status = 'WITHDRAWING'
        await withdraw.save()
        console.log('WITHDRAWING FROM FUND')
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-fund-withdraw', { withdrawModelId: withdraw.id })
        done()
      })
      .on('error', async (error) => {
        console.log('WITHDRAW FAILED')
        console.log(error)
        if (error.indexOf('nonce too low') >= 0) {
          ethTx.nonce = ethTx.nonce + 1
          await ethTx.save()
          await withdrawFromFund(ethTx, withdraw, agenda, done)
        } else {
          withdraw.status = 'FAILED'
          await withdraw.save()
          done(error)
        }
      })
  } catch (e) {
    console.log(e)
    console.log('ERROR')
  }
}

module.exports = {
  defineFundWithdrawJobs
}
