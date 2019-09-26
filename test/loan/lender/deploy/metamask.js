/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const BN = require('bignumber.js')
const { generateMnemonic } = require('bip39')

const { chains, connectMetaMask } = require('../../../common')
const { fundWeb3Address } = require('../../loanCommon')

chai.should()
const expect = chai.expect

chai.use(chaiHttp)
chai.use(chaiAsPromised)

function fundMetaMask (web3Chain) {
  describe('Send funds to MetaMask', () => {
    it('should send funds to MetaMask', async () => {
      await fundWeb3Address(web3Chain)
    })
  })
}

describe('Fund MetaMask', () => {
  connectMetaMask()
  fundMetaMask(chains.web3WithMetaMask)
})
