const axios = require('axios')
const web3 = require('../../../utils/web3')
const EthTx = require('../../../models/EthTx')
const { toWei } = web3().utils

async function setTxParams (data, from, to, instance) {
  const txParams = { data, from, to }

  let nonce, gasPrice, gasLimit
  try {
    [nonce, gasPrice, lastBlock] = await Promise.all([
      web3().eth.getTransactionCount(from),
      web3().eth.getGasPrice(),
      web3().eth.getBlock('latest')
    ])

    if (process.env.NODE_ENV === 'test') {
      gasLimit = lastBlock.gasLimit
    } else {
      gasLimit = await web3().eth.estimateGas(txParams)
    }
  } catch (e) {
    console.log('FAILED AT GAS STEP')
    console.log(e)
    instance.status = 'FAILED'
    instance.save()
    throw Error(e)
  }

  txParams.nonce = nonce
  txParams.gasPrice = gasPrice
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
}

function setGasLimit (gasLimit, lastBlock) {
  if ((gasLimit + 500000) > lastBlock.gasLimit) {
    return lastBlock.gasLimit
  } else {
    return gasLimit + 500000
  }
}

module.exports = {
  setTxParams,
  bumpTxFee
}
