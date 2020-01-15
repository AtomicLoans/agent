/* eslint-env mocha */
require('dotenv').config()
const chai = require('chai')
const mongoose = require('mongoose')
const BN = require('bignumber.js')
const toSecs = require('@mblackmblack/to-seconds')
const { checksumEncode } = require('@liquality/ethereum-utils')

const { chains } = require('../../common')
// const { setTxParams, bumpTxFee, sendTransaction } = require('../../../src/worker/loan/utils/web3Transaction')
const { setTxParams } = require('../../../src/worker/loan/utils/web3Transaction')
const { getObject } = require('../../../src/utils/contracts')
const { numToBytes32 } = require('../../../src/utils/finance')
const { getWeb3Address } = require('../util/web3Helpers')

const Loan = require('../../../src/models/Loan')
const LoanMarket = require('../../../src/models/LoanMarket')

chai.should()
const expect = chai.expect

const { MONGODB_TEST_URI } = process.env
const web3 = chains.web3WithHDWallet

describe('Web3 Transaction', () => {
  before(function (done) {
    mongoose.connect(MONGODB_TEST_URI, { useNewUrlParser: true, useCreateIndex: true })
    const db = mongoose.connection
    db.on('error', console.error.bind(console, 'connection error'))
    db.once('open', function () {
      done()
    })
  })

  describe('setTxParams', () => {
    it('should succeed in setting tx params if proper loan params and txData are provided', async () => {
      const principal = 'DAI'
      const loanId = 1

      const loans = getObject('loans', principal)

      const txData = loans.methods.approve(numToBytes32(loanId)).encodeABI()
      const params = { principal: 'DAI', collateral: 'BTC', principalAmount: BN(10).pow(18).toFixed(), loanDuration: toSecs({ days: 2 }) }
      const loanMarket = new LoanMarket({ minConf: 1, requestExpiresIn: 600000 })
      const minCollateralAmount = BN(10).pow(8).toFixed()

      const loan = Loan.fromLoanMarket(loanMarket, params, minCollateralAmount)
      await loan.save()

      const address = await getWeb3Address(web3)

      const from = address
      const to = '0x0000000000000000000000000000000000000000'

      const txParams = await setTxParams(txData, from, to, loan)
      const txCount = await web3.client.eth.getTransactionCount(from)
      const gasPriceActual = await web3.client.eth.getGasPrice()
      const estimatedGas = await web3.client.eth.estimateGas({ data: txData, from, to })

      const { failed, data, from: fromResult, to: toResult, gasPrice, nonce, gasLimit } = txParams

      expect(failed).to.equal(false)
      expect(data).to.equal(txData)
      expect(checksumEncode(fromResult)).to.equal(from)
      expect(toResult).to.equal(to)
      expect(nonce).to.equal(txCount)
      expect(parseInt(gasPriceActual)).to.equal(gasPrice)
      expect(estimatedGas + 100000).to.equal(gasLimit)
    })
  })

  // describe('bumpTxFee', () => {
  //   it('should', async () => {

  //   })
  // })

  // describe('sendTransaction', () => {
  //   it('should', async () => {

  //   })
  // })

  after(function (done) {
    mongoose.connection.db.dropDatabase(function () {
      mongoose.connection.close(done)
    })
  })
})
