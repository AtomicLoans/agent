const Fund = require('../../../models/Fund')
const EthTx = require('../../../models/EthTx')
const Deposit = require('../../../models/Deposit')
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

function defineFundDepositJobs (agenda) {
  agenda.define('fund-deposit', async (job, done) => {
    console.log('fund-deposit')
    const { data } = job.attrs
    const { fundModelId, amountToDeposit, saleId } = data

    const fund = await Fund.findOne({ _id: fundModelId }).exec()
    if (!fund) return console.log('Error: Fund not found')

    const { principal, fundId } = fund
    const unit = currencies[principal].unit
    const funds = getObject('funds', principal)
    const { lenderAddress } = await getFundParams(fund)

    const txData = funds.methods.deposit(numToBytes32(fundId), toWei(amountToDeposit.toString(), unit)).encodeABI()

    const ethTx = await setTxParams(txData, lenderAddress, getContract('funds', principal), fund)

    const deposit = Deposit.fromTxParams({ fundModelId, fundId, amount: amountToDeposit, ethTxId: ethTx.id })
    if (saleId) { deposit.saleId = saleId }
    await deposit.save()

    await depositToFund(ethTx, deposit, agenda, done)
  })

  agenda.define('verify-fund-deposit', async (job, done) => {
    const { data } = job.attrs
    const { depositModelId } = data

    const deposit = await Deposit.findOne({ _id: depositModelId }).exec()
    if (!deposit) return console.log('Error: Deposit not found')
    const { depositTxHash } = deposit

    console.log('CHECKING RECEIPT')

    const receipt = await web3().eth.getTransactionReceipt(depositTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: deposit.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && deposit.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await depositToFund(ethTx, deposit, agenda, done)
      } else {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-fund-deposit', { depositModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      deposit.status = 'DEPOSITED'
      await deposit.save()

      console.log('DEPOSIT SUCCESSFUL')
    }

    done()
  })
}

async function depositToFund (ethTx, deposit, agenda, done) {
  console.log('depositToFund')
  try {
    web3().eth.sendTransaction(ethTx.json())
      .on('transactionHash', async (transactionHash) => {
        console.log('transactionHash', transactionHash)
        deposit.depositTxHash = transactionHash
        deposit.status = 'DEPOSITING'
        await deposit.save()
        console.log('DEPOSITING TO FUND')
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-fund-deposit', { depositModelId: deposit.id })
        done()
      })
      .on('error', async (error) => {
        console.log('DEPOSIT FAILED')
        console.log(error)
        if (error.indexOf('nonce too low') >= 0) {
          ethTx.nonce = ethTx.nonce + 1
          await ethTx.save()
          await depositToFund(ethTx, deposit, agenda, done)
        } else {
          deposit.status = 'FAILED'
          await deposit.save()
          done(error)
        }
      })
  } catch (e) {
    console.log(e)
    console.log('ERROR')
  }
}

module.exports = {
  defineFundDepositJobs
}
