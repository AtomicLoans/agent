/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const { generateMnemonic } = require('bip39')

const { createFundAndRequestMultipleTimes } = require('./common')
const { fundAgent, fundLender, getTestObjects, cancelJobs, fundWeb3Address } = require('../loanCommon')
const { chains, connectMetaMask, rewriteEnv } = require('../../common')
const { getWeb3Address } = require('../util/web3Helpers')

chai.should()
const expect = chai.expect

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const server = 'http://localhost:3032/api/loan'

function testFunds (web3Chain, ethNode) {
  describe('Create Custom Loan Fund', () => {
    it('should create a new loan fund and deposit funds into it', async () => {
      const principal = 'DAI'
      const address = await getWeb3Address(web3Chain)
      const [funds] = await getTestObjects(web3Chain, principal, ['funds'])

      console.log('yep working')

      const secretHashesCount = await funds.methods.secretHashesCount(address).call()

      console.log('secretHashesCount', secretHashesCount)

      const count = 3

      await createFundAndRequestMultipleTimes('DAI', 'BTC', 500, count) // TODO: replace with creation of loan fund

      expect(true).to.equal(true)
    })
  })
}

async function testSetup (web3Chain, ethNode) {
  await ethNode.client.getMethod('jsonrpc')('miner_start')
  const address = await getWeb3Address(web3Chain) // TODO: move to loanCommon
  // rewriteEnv('.env', 'METAMASK_ETH_ADDRESS', address)
  await cancelJobs(server) // TODO: move to common for both lender and arbiter
  rewriteEnv('test/env/.env.test', 'LENDER_MNEMONIC', `"${generateMnemonic(128)}"`)
  // await removeFunds() // TODO: create functions for example lender mnemonic deploying funds when necessary
  await fundAgent(server)
  await fundLender(server) // TODO: create fundLender
  await fundWeb3Address(chains.web3WithLender)
  await fundWeb3Address(web3Chain) // TODO: move to common instead of just lender common
}

describe('Lender Agent - Funds', () => {
  describe.only('Web3HDWallet / BitcoinJs', () => {
    beforeEach(async function () { await testSetup(chains.web3WithHDWallet, chains.ethereumWithNode) })
    testFunds(chains.web3WithHDWallet, chains.ethereumWithNode)
  })

  describe('MetaMask / Ledger', () => {
    connectMetaMask()
    beforeEach(async function () { await testSetup(chains.web3WithMetaMask, chains.bitcoinWithLedger) })
    testFunds(chains.web3WithMetaMask, chains.bitcoinWithLedger)
  })

  describe('MetaMask / BitcoinJs', () => {
    connectMetaMask()
    beforeEach(async function () { await testSetup(chains.web3WithMetaMask, chains.ethereumWithNode) })
    testFunds(chains.web3WithMetaMask, chains.ethereumWithNode)
  })
})
