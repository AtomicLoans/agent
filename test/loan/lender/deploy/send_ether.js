/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const BN = require('bignumber.js')
const { generateMnemonic } = require('bip39')

const { chains, connectMetaMask, rewriteEnv } = require('../../../common')
const { fundArbiter, fundAgent, generateSecretHashesArbiter, fundWeb3Address, getAgentAddress, getTestContract, getTestObjects, removeFunds } = require('../../loanCommon')
const { createCustomFund } = require('../../setup/fundSetup')
const { currencies } = require('../../../../src/utils/fx')
const { numToBytes32 } = require('../../../../src/utils/finance')
const web3 = require('web3')

const { toWei } = web3.utils

chai.should()
const expect = chai.expect

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const lenderServer = 'http://localhost:3030/api/loan'
const arbiterServer = 'http://localhost:3032/api/loan'

function sendEther (web3Chain) {
  describe('Send Ether', () => {
    it('should send ether to lender and arbiter agents', async () => {
      await fundAgent(lenderServer)
      await fundAgent(arbiterServer)
    })
  })
}

describe('Lender Agent', () => {
  describe('Web3HDWallet / BitcoinJs', () => {
    sendEther(chains.web3WithHDWallet)
  })
})
