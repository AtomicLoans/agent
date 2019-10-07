const BN = require('bignumber.js')

const LoanMarket = require('../../../models/LoanMarket')
const EthTx = require('../../../models/EthTx')
const Approve = require('../../../models/Approve')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { setTxParams, bumpTxFee } = require('../utils/web3Transaction')
const web3 = require('../../../utils/web3')

const date = require('date.js')

function defineAgentApproveJobs (agenda) {
  agenda.define('approve-tokens', async (job, done) => {
    console.log('approve-tokens')
    const { data } = job.attrs
    const { loanMarketModelId } = data

    const loanMarket = await LoanMarket.findOne({ _id: loanMarketModelId }).exec()
    if (!loanMarket) return console.log('Error: LoanMarket not found')
    const { principal } = loanMarket
    const { principalAddress } = await loanMarket.getAgentAddresses()

    const token = getObject('erc20', principal)
    const fundsAddress = getContract('funds', principal)

    const allowance = await token.methods.allowance(principalAddress, fundsAddress).call()

    console.log('allowance', allowance)

    if (parseInt(allowance) === 0) {
      const txData = await token.methods.approve(fundsAddress, BN(2).pow(256).minus(1).toFixed()).encodeABI()
      const approve = Approve.fromPrincipal({ principal })
      await approve.save()
      const ethTx = await setTxParams(txData, principalAddress, getContract('erc20', principal), approve)

      approve.ethTxId = ethTx.id
      await approve.save()

      await approveTokens(ethTx, approve, agenda, done)
    } else {
      console.log('Already approved')
      const approve = Approve.findOne({ principal }).exec()
      if (approve) {
        approve.status = 'APPROVED'
        await approve.save()
      } else {
        const approve = Approve.fromPrincipal({ principal })
        approve.status = 'APPROVED'
        await approve.save()
      }
    }
  })

  agenda.define('verify-approve-tokens', async (job, done) => {
    const { data } = job.attrs
    const { approveModelId } = data

    const approve = await Approve.findOne({ _id: approveModelId }).exec()
    if (!approve) return console.log('Error: Approve not found')
    const { approveTxHash } = approve

    console.log('CHECKING RECEIPT')

    const receipt = await web3().eth.getTransactionReceipt(approveTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: approve.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && approve.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await approveTokens(ethTx, approve, agenda, done)
      } else {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-approve-tokens', { approveModelId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      approve.status = 'APPROVED'
      await approve.save()

      console.log('APPROVE SUCCESSFUL')
    }

    done()
  })
}

async function approveTokens (ethTx, approve, agenda, done) {
  console.log('approveTokens')
  try {
    web3().eth.sendTransaction(ethTx.json())
      .on('transactionHash', async (transactionHash) => {
        console.log('transactionHash', transactionHash)
        approve.approveTxHash = transactionHash
        approve.status = 'APPROVING'
        await approve.save()
        console.log(`APPROVING ${approve.principal}`)
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), 'verify-approve-tokens', { approveModelId: approve.id })
        done()
      })
      .on('error', (error) => {
        console.log('APPROVE FAILED')
        console.log(error)
        approve.status = 'FAILED'
        approve.save()
        done(error)
      })
  } catch (e) {
    console.log(e)
    console.log('ERROR')
  }
}

module.exports = {
  defineAgentApproveJobs
}
