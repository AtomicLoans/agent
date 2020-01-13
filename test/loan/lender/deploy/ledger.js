/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const isCI = require('is-ci')

const { chains, importBitcoinAddresses, fundUnusedBitcoinAddress } = require('../../../common')

chai.should()

chai.use(chaiHttp)
chai.use(chaiAsPromised)

function importLedger (btcChain, btcNode) {
  describe('Import and fund ledger addresses', () => {
    it('should import ledger addresses and fund unusedAddress', async () => {
      await importBitcoinAddresses(btcChain)
      await fundUnusedBitcoinAddress(btcChain)
      const newAddress = await btcNode.client.getMethod('jsonrpc')('getnewaddress')
      await btcNode.client.getMethod('jsonrpc')('generatetoaddress', 1, newAddress)
    })
  })
}

if (!isCI) {
  describe('Lender Agent - Import Ledger', () => {
    importLedger(chains.bitcoinWithLedger, chains.bitcoinWithNode)
  })
}
