/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')

const { chains, connectMetaMask } = require('../../../common')
const { fundWeb3Address, fundTokens } = require('../../loanCommon')
const { getWeb3Address } = require('../../util/web3Helpers')
const { currencies } = require('../../../../src/utils/fx')

const web3 = require('web3')
const { toWei } = web3.utils

chai.should()

chai.use(chaiHttp)
chai.use(chaiAsPromised)

function fundMetaMask (web3Chain) {
  describe('Send funds to MetaMask', () => {
    it('should send funds to MetaMask', async () => {
      await fundWeb3Address(web3Chain)

      const principal = 'USDC'
      const unit = currencies[principal].unit

      const address = await getWeb3Address(web3Chain)
      await fundTokens(address, toWei('100', unit), 'USDC')
    })
  })
}

describe('Fund MetaMask', () => {
  connectMetaMask()
  fundMetaMask(chains.web3WithMetaMask)
})
