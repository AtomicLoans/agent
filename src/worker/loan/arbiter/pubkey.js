const { ensure0x } = require('@liquality/ethereum-utils')
const date = require('date.js')

const EthTx = require('../../../models/EthTx')
const LoanMarket = require('../../../models/LoanMarket')
const PubKey = require('../../../models/PubKey')
const { getObject } = require('../../../utils/contracts')
const { setTxParams, bumpTxFee } = require('../utils/web3Transaction')
const web3 = require('../../../utils/web3')

function defineArbiterPubKeyJobs (agenda) {
  agenda.define('set-pubkey', async (job, done) => {
    const { data } = job.attrs
    const { loanMarketId } = data

    const loanMarket = await LoanMarket.findOne({ _id: loanMarketId }).exec()
    if (!loanMarket) return console.log('Error: LoanMarket not found')

    const { principal } = loanMarket
    const { collateralPublicKey: lenderPublicKey, principalAddress: lenderAddress } = await loanMarket.getAgentAddresses()

    const funds = await getObject('funds', principal)
    const fundContractAddress = process.env[`${principal}_LOAN_FUNDS_ADDRESS`]

    const txData = funds.methods.setPubKey(ensure0x(lenderPublicKey)).encodeABI()

    const pubKey = PubKey.fromPubKey(ensure0x(lenderPublicKey))
    await pubKey.save()

    const ethTx = await setTxParams(txData, lenderAddress, fundContractAddress, pubKey)

    pubKey.ethTxId = ethTx.id
    await pubKey.save()

    await setPubKey(ethTx, pubKey, agenda, done)
  })

  agenda.define('verify-set-pubkey', async (job, done) => {
    const { data } = job.attrs
    const { pubKeyId } = data

    const pubKey = await PubKey.findOne({ _id: pubKeyId }).exec()
    if (!pubKey) return console.log('Error: PubKey not found')
    const { pubKeyTxHash } = pubKey

    console.log('CHECKING RECEIPT')

    const receipt = await web3().eth.getTransactionReceipt(pubKeyTxHash)

    if (receipt === null) {
      console.log('RECEIPT IS NULL')

      const ethTx = await EthTx.findOne({ _id: pubKey.ethTxId }).exec()
      if (!ethTx) return console.log('Error: EthTx not found')

      if (date(process.env.BUMP_TX_INTERVAL) > ethTx.updatedAt && pubKey.status !== 'FAILED') {
        console.log('BUMPING TX FEE')

        await bumpTxFee(ethTx)
        await setPubKey(ethTx, pubKey, agenda, done)
      } else {
        await agenda.schedule(process.env.CHECK_TX_INTERVAL, 'verify-set-pubkey', { pubKeyId })
      }
    } else if (receipt.status === false) {
      console.log('RECEIPT STATUS IS FALSE')
      console.log('TX WAS MINED BUT TX FAILED')
    } else {
      console.log('RECEIPT IS NOT NULL')

      console.log('SET')
      pubKey.status = 'SET'
      await pubKey.save()
      done()
    }

    done()
  })
}

async function setPubKey (ethTx, pubKey, agenda, done) {
  web3().eth.sendTransaction(ethTx.json())
    .on('transactionHash', async (transactionHash) => {
      pubKey.ethTxId = ethTx.id
      pubKey.pubKeyTxHash = transactionHash
      pubKey.status = 'SETTING'
      pubKey.save()
      console.log('SETTING')
      await agenda.now('verify-set-pubkey', { pubKeyId: pubKey.id })
      done()
    })
    .on('error', (error) => {
      console.log('FAILED TO SET PUBKEY')
      console.log(error)
      pubKey.status = 'FAILED'
      pubKey.save()
      done(error)
    })
}

module.exports = {
  defineArbiterPubKeyJobs
}