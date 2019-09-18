const Web3 = require('web3')
const HDWalletProvider = require('@truffle/hdwallet-provider')

const { MNEMONIC, ETH_RPC } = process.env

const httpProvider = new Web3.providers.HttpProvider(ETH_RPC)
const provider = new HDWalletProvider(MNEMONIC, httpProvider)
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
  if (process.env.NODE_ENV === 'test') {
    const fs = require('fs')
    const path = require('path')
    const env = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf-8')
    process.env.MNEMONIC = env.match(/(([a-z])\w+([ ])\w){11}([a-z])\w+/g)
  }

  const { MNEMONIC, ETH_RPC } = process.env

  const httpProvider = new Web3.providers.HttpProvider(ETH_RPC)
  const provider = new HDWalletProvider(MNEMONIC, httpProvider)
  const web3 = new Web3(provider)

  return web3
}

module.exports = getWeb3
