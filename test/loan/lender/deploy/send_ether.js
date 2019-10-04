/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')

const { chains } = require('../../../common')
const { fundAgent } = require('../../loanCommon')

chai.should()
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
