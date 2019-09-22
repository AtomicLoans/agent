const Web3 = require('web3')
const HDWalletProvider = require('@truffle/hdwallet-provider')
const { updateEnvValue } = require('./test')
const { isArbiter } = require('./env')

const { LENDER_MNEMONIC, ARBITER_MNEMONIC, ETH_RPC } = process.env

const httpProvider = new Web3.providers.HttpProvider(ETH_RPC)
const provider = new HDWalletProvider(isArbiter() ? ARBITER_MNEMONIC : LENDER_MNEMONIC, httpProvider, 0, 1, false)
const web3 = new Web3(provider)

function getWeb3 () {
  if (process.env.NODE_ENV === 'test') {
    const web3 = resetWeb3()
    return web3
  } else {
    return web3
  }
}

function resetWeb3 () {
  updateEnvValue('ETH_SIGNER')
  updateEnvValue('TEST_TX_OVERWRITE')
  const LENDER_MNEMONIC = updateEnvValue('LENDER_MNEMONIC')
  const ARBITER_MNEMONIC = updateEnvValue('ARBITER_MNEMONIC')

  const provider = new HDWalletProvider(isArbiter() ? ARBITER_MNEMONIC : LENDER_MNEMONIC, httpProvider, 0, 1, false)
  const web3 = new Web3(provider)

  return web3
}

module.exports = getWeb3
