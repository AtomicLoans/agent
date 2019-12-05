const axios = require('axios')
const { sha256 } = require('@liquality/crypto')
const compareVersions = require('compare-versions')

const web3 = require('../../../utils/web3')
const EthTx = require('../../../models/EthTx')
const LoanMarket = require('../../../models/LoanMarket')

function defineTxEthJobs (agenda) {
  agenda.define('sanitize-eth-txs', async (job, done) => {
    console.log('sanitize-eth-txs')

    const loanMarket = await LoanMarket.findOne().exec()
    const { principalAddress } = await loanMarket.getAgentAddresses()

    const txCount = await web3().eth.getTransactionCount(principalAddress)

    const oneHourAgo = new Date(Date.now() - (60*60*1000))

    const ethTxs = await EthTx.find({ nonce: { $gte: txCount }, createdAt: { $lt: oneHourAgo }, failed: false }).exec()
    for (let i = 0; i < ethTxs.length; i++) {
      const ethTx = ethTxs[i]

      console.log('ethTx one hour ago', ethTx)

      ethTx.failed = true
      await ethTx.save()
    }
    console.log('oneHourAgo', oneHourAgo)
    console.log('txCount', txCount)

    done()
  })
}

module.exports = {
  defineTxEthJobs
}