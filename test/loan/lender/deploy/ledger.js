/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')

const { chains, importBitcoinAddresses, fundUnusedBitcoinAddress } = require('../../../common')

chai.should()

chai.use(chaiHttp)
chai.use(chaiAsPromised)

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
