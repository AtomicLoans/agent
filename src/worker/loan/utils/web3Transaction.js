const axios = require('axios')
const { getAgentUrl } = require('../../../utils/url')
const EthTx = require('../../../models/EthTx')
const web3 = require('../../../utils/web3')
const { toWei } = web3().utils

const { NETWORK, BUGSNAG_API } = process.env

const bugsnag = require('@bugsnag/js')
const bugsnagClient = bugsnag(BUGSNAG_API)

async function setTxParams (data, from, to, instance) {
  const txParams = { data, from, to }

  let txCount, gasPrice, gasLimit, lastBlock
  try {
    [txCount, gasPrice, lastBlock] = await Promise.all([
      web3().eth.getTransactionCount(from),
      web3().eth.getGasPrice(),
      web3().eth.getBlock('latest')
    ])

    try {
      if (process.env.NODE_ENV === 'test') {
        gasLimit = lastBlock.gasLimit
      } else {
        gasLimit = await web3().eth.estimateGas(txParams)
        if ((gasLimit + 100000) < lastBlock.gasLimit) {
          gasLimit = gasLimit + 100000
        }
      }
    } catch(e) {
      gasLimit = lastBlock.gasLimit
    }
  } catch (e) {
    console.log('FAILED AT GAS STEP')
    console.log(e)
    instance.status = 'FAILED'
    instance.save()
    throw Error(e)
  }

  const currentGasPrice = gasPrice

  let fastPriceInWei
  try {
    const { data: gasPricesFromOracle } = await axios(`https://www.etherchain.org/api/gasPriceOracle`)
    const { fast } = gasPricesFromOracle
    fastPriceInWei = parseInt(toWei(fast, 'gwei'))
  } catch (e) {
    fastPriceInWei = currentGasPrice
  }

  if (NETWORK === 'mainnet') {
    txParams.gasPrice = fastPriceInWei
  } else {
    txParams.gasPrice = gasPrice
  }

  const ethTxs = await EthTx.find().sort({ nonce: 'descending' }).exec()
  if (ethTxs.length === 0) {
    txParams.nonce = txCount
  } else {
    // check to see if any txs have timed out
    const ethTxsTimedOut = await EthTx.find({ timedOut: true, overWritten: false }).sort({ nonce: 'descending' }).exec()
    if (ethTxsTimedOut.length > 0) {
      const ethTxToReplace = ethTxsTimedOut[0]
      if (ethTxToReplace.nonce >= txCount) {
        txParams.nonce = ethTxToReplace.nonce
        ethTxToReplace.overWritten = true
        await ethTxToReplace.save()
      } else {
        txParams.nonce = ethTxs[0].nonce + 1
      }
    } else {
      txParams.nonce = ethTxs[0].nonce + 1
    }
  }

  txParams.gasLimit = gasLimit

  const ethTx = EthTx.fromTxParams(txParams)
  await ethTx.save()

  return ethTx
}

async function bumpTxFee (ethTx) {
  const { gasPrice: currentGasPrice } = ethTx

  let fastPriceInWei
  try {
    const { data: gasPricesFromOracle } = await axios(`https://www.etherchain.org/api/gasPriceOracle`)
    const { fastest } = gasPricesFromOracle
    fastPriceInWei = parseInt(toWei(fastest, 'gwei'))
  } catch (e) {
    fastPriceInWei = currentGasPrice
  }

  if (fastPriceInWei > (currentGasPrice * 1.5)) {
    ethTx.gasPrice = Math.min(Math.ceil(fastPriceInWei), toWei('50', 'gwei'))
  } else {
    ethTx.gasPrice = Math.min(Math.ceil(currentGasPrice * 1.51), toWei('50', 'gwei'))
  }

  await ethTx.save()
}

async function sendTransaction (ethTx, instance, agenda, done, successCallback, errorCallback) {
  web3().eth.sendTransaction(ethTx.json())
    .on('transactionHash', async (transactionHash) => {
      await successCallback(transactionHash, ethTx, instance, agenda)
      done()
    })
    .on('error', async (error) => {
      console.log(error)
      if ((String(error).indexOf('nonce too low') >= 0) || (String(error).indexOf('There is another transaction with same nonce in the queue') >= 0)) {
        ethTx.nonce = ethTx.nonce + 1
        await ethTx.save()
        await sendTransaction(ethTx, instance, agenda, done, successCallback, errorCallback)
      } else if (String(error).indexOf('account has nonce of') >= 0) {
        const [accountNonce, txNonce] = String(error)
          .split("Error: the tx doesn't have the correct nonce. account has nonce of: ")[1]
          .split(" tx has nonce of: ")
          .map(x => parseInt(x))

        ethTx.nonce = accountNonce
        await ethTx.save()
        await sendTransaction(ethTx, instance, agenda, done, successCallback, errorCallback)
      } else if (String(error).indexOf('Transaction was not mined within') >= 0) {
        const { from } = ethTx
        const txCount = await web3().eth.getTransactionCount(from)
        ethTx.timedOut = true
        await ethTx.save()
      } else {
        const agentUrl = getAgentUrl()

        bugsnagClient.metaData = {
          ethTx,
          instance,
          model: instance.collection.name,
          agentUrl
        }
        bugsnagClient.notify(error)

        await errorCallback(error, instance)
        done(error)
      }
    })
  done()
}

module.exports = {
  setTxParams,
  bumpTxFee,
  sendTransaction
}
