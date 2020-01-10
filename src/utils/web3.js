const fs = require('fs')
const path = require('path')

const Web3 = require('web3')
const HDWalletProvider = require('@truffle/hdwallet-provider')
const { updateEnvValue, getEnvValue } = require('./test')
const { isArbiter } = require('./env')

const { MNEMONIC, MNEMONIC_ARBITER, ETH_RPC } = process.env

const httpProvider = new Web3.providers.HttpProvider(ETH_RPC)
console.log('isArbiter()', isArbiter())
console.log('MNEMONIC_ARBITER', MNEMONIC_ARBITER)
console.log('MNEMONIC', MNEMONIC)

const env = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf-8')
console.log('env', env)

const provider = new HDWalletProvider(isArbiter() ? MNEMONIC_ARBITER : MNEMONIC, httpProvider, 0, 1, false)
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
  updateEnvValue('METAMASK_ETH_ADDRESS')
  updateEnvValue('TEST_TX_OVERWRITE')
  updateEnvValue('API_OFFLINE')
  updateEnvValue('ACCEPT_CANCEL_JOBS_OFFLINE')
  const MNEMONIC = updateEnvValue('MNEMONIC')
  const MNEMONIC_ARBITER = updateEnvValue('MNEMONIC_ARBITER')

  const provider = new HDWalletProvider(isArbiter() ? MNEMONIC_ARBITER : MNEMONIC, httpProvider, 0, 1, false)
  const web3 = new Web3(provider)

  return web3
}

module.exports = getWeb3
