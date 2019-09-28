/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const BN = require('bignumber.js')
const toSecs = require('@mblackmblack/to-seconds')
const bitcoin = require('bitcoinjs-lib')
const { ensure0x } = require('@liquality/ethereum-utils')
const { generateMnemonic } = require('bip39')
const { sha256 } = require('@liquality/crypto')
const { sleep } = require('@liquality/utils')
const HDWalletProvider = require('@truffle/hdwallet-provider')

const { chains, connectMetaMask, importBitcoinAddresses, importBitcoinAddressesByAddress, fundUnusedBitcoinAddress, rewriteEnv, getWeb3Chain } = require('../../../common')
const { fundArbiter, fundAgent, generateSecretHashesArbiter, getLockParams, getTestContract, getTestObject, cancelLoans, fundWeb3Address, cancelJobs, removeFunds, removeLoans } = require('../../loanCommon')
const { getWeb3Address } = require('../../util/web3Helpers')
const { currencies } = require('../../../../src/utils/fx')
const { numToBytes32 } = require('../../../../src/utils/finance')
const { testLoadObject } = require('../../util/contracts')
const { createCustomFund } = require('../../setup/fundSetup')
const web3 = require('web3')

const { toWei } = web3.utils

chai.should()
const expect = chai.expect

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const server = 'http://localhost:3030/api/loan'

const arbiterChain = chains.web3WithArbiter

function importLedger (btcChain, btcNode) {
  describe('Import and fund ledger addresses', () => {
    it('should import ledger addresses and fund unusedAddress', async () => {
      await importBitcoinAddresses(btcChain)
      await fundUnusedBitcoinAddress(btcChain)
      await btcNode.client.getMethod('jsonrpc')('generate', 1)
    })
  })
}

describe('Lender Agent - Import Ledger', () => {
  importLedger(chains.bitcoinWithLedger, chains.bitcoinWithNode)
})
