const web3 = require('./web3')

async function getCurrentTime () {
  const latestBlockNumber = await web3().eth.getBlockNumber()
  const latestBlockTimestamp = (await web3().eth.getBlock(latestBlockNumber)).timestamp
  return latestBlockTimestamp
}

module.exports = {
  getCurrentTime
}
