const axios = require('axios')
const web3 = require('../../../utils/web3')
const EthTx = require('../../../models/EthTx')
const { toWei } = web3().utils

async function setTxParams (data, from, to, instance) {
  const txParams = { data, from, to }

  let nonce, gasPrice, gasLimit
  try {
    [nonce, gasPrice, gasLimit, lastBlock] = await Promise.all([
      web3().eth.getTransactionCount(from),
      web3().eth.getGasPrice(),
      web3().eth.estimateGas(txParams),
      web3().eth.getBlock('latest')
    ])
  } catch (e) {
    console.log('FAILED AT GAS STEP')
    instance.status = 'FAILED'
    instance.save()
    throw Error(e)
  }

  console.log('lastBlock', lastBlock)

  txParams.nonce = nonce
  txParams.gasPrice = gasPrice
  txParams.gasLimit = setGasLimit(gasLimit, lastBlock)

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
