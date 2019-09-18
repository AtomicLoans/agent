const web3 = require('../../../utils/web3')
const EthTx = require('../../../models/EthTx')

async function setTxParams (data, from, to, instance) {
  const txParams = { data, from, to }

  let nonce, gasPrice, gasLimit
  try {
    [nonce, gasPrice, gasLimit] = await Promise.all([
      web3().eth.getTransactionCount(from),
      web3().eth.getGasPrice(),
      web3().eth.estimateGas(txParams)
    ])
  } catch(e) {
    console.log('FAILED AT GAS STEP')
    instance.status = 'FAILED'
    instance.save()
    throw Error(e)
  }

  txParams.nonce = nonce
  txParams.gasPrice = gasPrice
  txParams.gasLimit = gasLimit + 3000000

  const ethTx = EthTx.fromTxParams(txParams)
  await ethTx.save()

  return ethTx
}

module.exports = {
  setTxParams
}
