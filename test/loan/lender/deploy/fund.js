/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const BN = require('bignumber.js')
const { generateMnemonic } = require('bip39')

const { chains, rewriteEnv } = require('../../../common')
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

const server = 'http://localhost:3030/api/loan'

const arbiterChain = chains.web3WithArbiter

const principal = process.env.PRINCIPAL
const amount = process.env.AMOUNT

function deployFund (web3Chain) {
  describe(`Create Custom ${principal} Loan Fund`, () => {
    it(`should create a new ${amount} loan fund and deposit funds into it`, async () => {
      const [token, funds] = await getTestObjects(web3Chain, principal, ['erc20', 'funds'])
      const agentAddress = await getAgentAddress(server)
      const balanceBefore = await token.methods.balanceOf(getTestContract('funds', principal)).call()

      const fundId = await createCustomFund(web3Chain, arbiterChain, amount, principal) // Create Custom Loan Fund with 200 DAI

      const balanceAfter = await token.methods.balanceOf(getTestContract('funds', principal)).call()
      const { lender } = await funds.methods.funds(numToBytes32(fundId)).call()

      expect(balanceAfter.toString()).to.equal(BN(balanceBefore).plus(toWei(amount.toString(), currencies[principal].unit)).toString())
      expect(lender).to.equal(agentAddress)
    })
  })
}

async function testSetup (web3Chain) {
  rewriteEnv('.env', 'MNEMONIC', `"${generateMnemonic(128)}"`)
  await removeFunds()
  await fundAgent(server)
  await fundArbiter()
  await generateSecretHashesArbiter(principal)
  await fundWeb3Address(web3Chain)
}

describe('Lender Agent - Deploy - Fund', () => {
  describe('Web3HDWallet / BitcoinJs', () => {
    beforeEach(async function () { await testSetup(chains.web3WithHDWallet) })
    deployFund(chains.web3WithHDWallet)
  })
})
