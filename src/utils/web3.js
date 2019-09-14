if (process.env.NODE_ENV === 'test') {
  const fs = require('fs')
  const path = require('path')
  const env = fs.readFileSync(path.resolve(process.cwd(), '.env'), 'utf-8')
  process.env.MNEMONIC = env.match(/(([a-z])\w+([ ])\w){11}([a-z])\w+/g)
}

const Web3 = require('web3')
const Web3HDWalletProvider = require('web3-hdwallet-provider')

const { MNEMONIC, ETH_RPC } = process.env

const httpProvider = new Web3.providers.HttpProvider(ETH_RPC)
const provider = new Web3HDWalletProvider(MNEMONIC, httpProvider)
const web3 = new Web3(provider)

module.exports = web3
