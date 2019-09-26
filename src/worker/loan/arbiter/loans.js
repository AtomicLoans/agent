const { ensure0x } = require('@liquality/ethereum-utils')
const date = require('date.js')
const BN = require('bignumber.js')

const EthTx = require('../../../models/EthTx')
const LoanMarket = require('../../../models/LoanMarket')
const Market = require('../../../models/Market')
const PubKey = require('../../../models/PubKey')
const { getObject, getContract } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { setTxParams, bumpTxFee } = require('../utils/web3Transaction')
const { numToBytes32 } = require('../../../utils/finance')
const { currencies } = require('../../../utils/fx')
const { getCurrentTime } = require('../../../utils/time')
const web3 = require('../../../utils/web3')

const { fromWei } = web3().utils

function defineArbiterLoanJobs (agenda) {

  // Add loan records that current don't exist 


  // look through all loans every minute, and update the state based on bools

  // Accept / Cancel loans that should be accepted / cancelled
  // Update state of loans that have been accepted / cancelled by lender


  agenda.define('update-loan-records', async (job, done) => {
    const { data } = job.attrs
    const { loanMarketId } = data

    const loanMarket = await LoanMarket.findOne({ _id: loanMarketId }).exec()
    if (!loanMarket) return console.log('Error: LoanMarket not found')

    const { principal, collateral, minConf } = loanMarket
    const { collateralPublicKey: arbiterPublicKey, principalAddress: arbiterAddress } = await loanMarket.getAgentAddresses()

    const market = await Market.findOne({ from: collateral, to: principal }).exec()
    if (!market) return console.log('Error: Market not found')
    const { rate } = market

    const loansContract = getObject('loans', principal)

    const loanIndex = await loansContract.methods.loanIndex().call()

    let currentIndex = loanMarket.loanIndex + 1

    while (currentIndex <= loanIndex) {
      const [loans, bools, approveExpiration, acceptExpiration] = await Promise.all([
        loansContract.methods.loans(numToBytes32(currentIndex)).call(),
        loansContract.methods.bools(numToBytes32(currentIndex)).call(),
        loansContract.methods.approveExpiration(numToBytes32(currentIndex)).call(),
        loansContract.methods.acceptExpiration(numToBytes32(currentIndex)).call()
      ])

      const { funded, approved, withdrawn, sale, paid, off } = bools
      const { loanExpiration, arbiter } = loans

      if (arbiterAddress === arbiter) {
        const currentTime = await getCurrentTime()

        let status

        if (!approved) {
          if (currentTime < approveExpiration) {
            status = 'AWAITING_COLLATERAL'
          } else {
            status = 'CANCELLING'
            // TODO: ARBITER SHOULD CREATE JOB TO CANCEL LOAN
          }
        } else if (!withdrawn) {
          status = 'APPROVED'
        } else if (!paid) {
          if (!sale) {
            if (currentTime < loanExpiration) {
              status = 'WITHDRAWN'
            } else {
              // DEFAULTED
            }
          } else {
            status = 'LIQUIDATING'
          }
        } else if (!sale && !off) {
          if (currentTime < acceptExpiration) {
            status = 'ACCEPTING'
            // TODO: ARBITER SHOULD CREATE JOB TO ACCEPT LOAN
          } else {
            // BAD FUCK UP
          }
        } else {
          status = 'ACCEPTED'
        }

        const unit = currencies[principal].unit
        const { principal: principalAmountInWei, requestTimestamp: requestCreatedAt, createdAt, liquidationRatio } = loans
        const principalAmount = fromWei(principalAmount, unit)
        const loanDuration = loanExpiration - createdAt
        const params = { principal, collateral, principalAmount, loanDuration }
        const minimumCollateralAmount = BN(principalAmount).dividedBy(rate).times(fromWei(liquidationRatio, 'gether')).toFixed(8)

        const loan = Loan.fromLoanMarket(loanMarket, params, minimumCollateralAmount)
        loan.status = status

        await loan.save()
      }

      currentIndex++
    }

    done()
  })
}

module.exports = {
  defineArbiterLoanJobs
}
