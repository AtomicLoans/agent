const axios = require('axios')
const web3 = require('../../../utils/web3')
const EthTx = require('../../../models/EthTx')
const { toWei } = web3().utils

const { NETWORK } = process.env

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
    txParams.nonce = ethTxs[0].nonce + 1
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
    ethTx.gasPrice = Math.ceil(fastPriceInWei)
  } else {
    ethTx.gasPrice = Math.ceil(currentGasPrice * 1.51)
  }

  await ethTx.save()
}

module.exports = {
  setTxParams,
  bumpTxFee
}
