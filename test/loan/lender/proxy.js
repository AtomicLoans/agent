/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const BN = require('bignumber.js')
const toSecs = require('@mblackmblack/to-seconds')
const { generateMnemonic } = require('bip39')
const isCI = require('is-ci')

const { chains, importBitcoinAddresses, fundUnusedBitcoinAddress, rewriteEnv } = require('../../common')
const { fundArbiter, fundAgent, generateSecretHashesArbiter, getAgentAddress, getTestObject, cancelLoans, fundWeb3Address, cancelJobs, restartJobs, removeFunds, removeLoans, increaseTime, isAgentProxy } = require('../loanCommon')
const { getWeb3Address } = require('../util/web3Helpers')

const hotColdWallet = require('../../../src/abi/hotcoldwallet.json')

const { USDC_FUNDS, USDC_LOANS, USDC_SALES } = require('../../../src/config/addresses/test.json')
// const { DAI_FUNDS, DAI_LOANS, DAI_SALES } = require('../../../src/config/addresses/test.json')

chai.should()

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const YEAR_IN_SECONDS = BN(31536000)

const server = 'http://localhost:3030/api/loan'
const arbiterServer = 'http://localhost:3032/api/loan'

function testProxy (web3Chain, ethNode, btcChain) {
  describe('Hot Cold Wallet Proxy Tests', () => {
    it('should POST loanMarket details and return loan details', async () => {
      const principal = 'USDC'
      const collateral = 'BTC'

      const address = await getWeb3Address(web3Chain)
      console.log('address', address)

      const agentAddress = await getAgentAddress(server)
      const arbiterAddress = await getAgentAddress(arbiterServer)

      const fundParams = [
        toSecs({ days: 50 }),
        YEAR_IN_SECONDS.times(2).plus(Math.floor(Date.now() / 1000)).toFixed(),
        arbiterAddress,
        false,
        0
      ]

      const funds = await getTestObject(web3Chain, 'funds', principal)
      const createFundTxData = funds.methods.create(...fundParams).encodeABI()

      const walletProxy = new web3Chain.client.eth.Contract(hotColdWallet.abi, { from: address })

      const walletProxyInstance = await walletProxy.deploy({
        data: hotColdWallet.bytecode,
        arguments: [USDC_FUNDS, USDC_LOANS, USDC_SALES, agentAddress, createFundTxData]
        // arguments: [DAI_FUNDS, DAI_LOANS, DAI_SALES, agentAddress, createFundTxData]
      }).send({ gas: 2000000 })

      const { _address: proxyAddress } = walletProxyInstance

      const { status: requestsStatus, body: requestsBody } = await chai.request(server).post('/funds/new').send({ principal, collateral, proxyAddress })
      console.log('requestsStatus', requestsStatus)
      console.log('requestsBody', requestsBody)
    })
  })
}

async function testSetup (web3Chain, btcChain) {
  const blockHeight = await chains.bitcoinWithJs.client.chain.getBlockHeight()
  if (blockHeight < 101) {
    await chains.bitcoinWithJs.client.chain.generateBlock(101)
  }

  if (!isAgentProxy(server)) {
    await increaseTime(3600)
    const address = await getWeb3Address(web3Chain)
    rewriteEnv('.env', 'METAMASK_ETH_ADDRESS', address)
    await cancelLoans(web3Chain)
    await cancelJobs(server)
    await cancelJobs(arbiterServer)
    rewriteEnv('.env', 'MNEMONIC', `"${generateMnemonic(128)}"`)
    await removeFunds()
    await removeLoans()
    await fundAgent(server)
    await fundArbiter()
    await generateSecretHashesArbiter('USDC')
  }

  await fundWeb3Address(web3Chain)
  await importBitcoinAddresses(btcChain)
  await fundUnusedBitcoinAddress(btcChain)
  await restartJobs(server)
  await restartJobs(arbiterServer)
  await increaseTime(3600)
}

describe('Lender Agent - Funds', () => {
  describe('Web3HDWallet / BitcoinJs', () => {
    before(async function () {
      await testSetup(chains.web3WithHDWallet, chains.bitcoinWithJs)
      // testSetupArbiter()
    })
    // after(function () {
    //   testAfterArbiter()
    // })
    testProxy(chains.web3WithHDWallet, chains.ethereumWithNode, chains.bitcoinWithJs)
  })

  if (!isCI) {
    // describe('MetaMask / BitcoinJs', () => {
    //   connectMetaMask()
    //   before(async function () { await testSetup(chains.web3WithMetaMask, chains.ethereumWithNode, chains.bitcoinWithJs) })
    //   testE2E(chains.web3WithMetaMask, chains.bitcoinWithJs)
    // })

    // describe('MetaMask / Ledger', () => {
    //   connectMetaMask()
    //   before(async function () { await testSetup(chains.web3WithMetaMask, chains.bitcoinWithLedger) })
    //   testE2E(chains.web3WithMetaMask, chains.bitcoinWithLedger)
    // })
  }
})
