const axios = require('axios')
const Agent = require('../../../models/Agent')
const Approve = require('../../../models/Approve')
const Fund = require('../../../models/Fund')
const Loan = require('../../../models/Loan')
const Sale = require('../../../models/Sale')
const LoanMarket = require('../../../models/LoanMarket')
const { numToBytes32 } = require('../../../utils/finance')
const { getCurrentTime } = require('../../../utils/time')
const { getObject } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { isArbiter } = require('../../../utils/env')

const web3 = require('../../../utils/web3')

function defineLoanStatusJobs (agenda) {
  agenda.define('check-loan-statuses-and-update', async (job, done) => {
    console.log('check-loan-statuses-and-update')

    try {
      const loanMarkets = await LoanMarket.find().exec()

      for (let i = 0; i < loanMarkets.length; i++) {
        const loanMarket = loanMarkets[i]

        const { principalAddress } = await loanMarket.getAgentAddresses()
        const ethBalance = await web3().eth.getBalance(principalAddress)

        if (ethBalance > 0) {
          const { principal } = loanMarket
          const loans = getObject('loans', principal)

          if (!isArbiter()) {
            const approves = await Approve.find({ principal, status: { $nin: [ 'FAILED' ] } }).exec()

            if (approves.length === 0) {
              await agenda.schedule(getInterval('ACTION_INTERVAL'), 'approve-tokens', { loanMarketModelId: loanMarket.id })
            } else {
              const funds = await Fund.find({ status: 'WAITING_FOR_APPROVE' }).exec()

              for (let j = 0; j < funds.length; j++) {
                const fund = funds[j]
                await agenda.schedule(getInterval('ACTION_INTERVAL'), 'create-fund-ish', { fundModelId: fund.id })
              }
            }
          }

          const loanModels = await Loan.find({ principal, status: { $nin: [ 'QUOTE', 'REQUESTING', 'CANCELLING', 'CANCELLED', 'ACCEPTING', 'ACCEPTED', 'LIQUIDATED', 'FAILED' ] }})

          for (let j = 0; j < loanModels.length; j++) {
            const loan = loanModels[j]
            const { loanId } = loan

            const { approved, withdrawn, sale, paid, off } = await loans.methods.bools(numToBytes32(loanId)).call()

            if (!approved && !withdrawn && !paid && !sale && !off) {
              // CHECK LOCK COLLATERAL

              const [approved, approveExpiration, currentTime] = await Promise.all([
                loans.methods.approved(numToBytes32(loanId)).call(), // Sanity check
                loans.methods.approveExpiration(numToBytes32(loanId)).call(),
                getCurrentTime()
              ])

              if (currentTime > approveExpiration && !approved) {
                // TODO: arbiter should check if lender agent has already tried cancelling
                await agenda.schedule(getInterval('ACTION_INTERVAL'), 'accept-or-cancel-loan', { loanModelId: loan.id })
              } else {
                const { collateralRefundableP2SHAddress, collateralSeizableP2SHAddress, refundableCollateralAmount, seizableCollateralAmount } = loan

                const [refundableBalance, seizableBalance, refundableUnspent, seizableUnspent] = await Promise.all([
                  loan.collateralClient().chain.getBalance([collateralRefundableP2SHAddress]),
                  loan.collateralClient().chain.getBalance([collateralSeizableP2SHAddress]),
                  loan.collateralClient().getMethod('getUnspentTransactions')([collateralRefundableP2SHAddress]),
                  loan.collateralClient().getMethod('getUnspentTransactions')([collateralSeizableP2SHAddress])
                ])

                const collateralRequirementsMet = (refundableBalance.toNumber() >= refundableCollateralAmount && seizableBalance.toNumber() >= seizableCollateralAmount)
                const refundableConfirmationRequirementsMet = refundableUnspent.length === 0 ? false : refundableUnspent[0].confirmations > 0
                const seizableConfirmationRequirementsMet = seizableUnspent.length === 0 ? false : seizableUnspent[0].confirmations > 0

                if (collateralRequirementsMet && refundableConfirmationRequirementsMet && seizableConfirmationRequirementsMet) {
                  console.log('COLLATERAL LOCKED')

                  if (!isArbiter()) {
                    await agenda.schedule(getInterval('ACTION_INTERVAL'), 'approve-loan', { loanModelId: loan.id })
                  }
                } else {
                  console.log('COLLATERAL NOT LOCKED')
                  // TODO: add reason for canceling (for example, cancelled because collateral wasn't sufficient)
                  const { loanId, principal } = loan
                  const loans = getObject('loans', principal)

                  const [approved, approveExpiration, currentTime] = await Promise.all([
                    loans.methods.approved(numToBytes32(loanId)).call(), // Sanity check
                    loans.methods.approveExpiration(numToBytes32(loanId)).call(),
                    getCurrentTime()
                  ])
                }
              }
            } else if (withdrawn && !paid && !sale && !off) {
              loan.status = 'WITHDRAWN'
              await loan.save()
            } else if (withdrawn && paid && !sale && !off) {
              loan.status = 'REPAID'
              await loan.save()
              console.log('REPAID')
              if (isArbiter()) {
                const lender = await loans.methods.lender(numToBytes32(loanId)).call()
                const agents = await Agent.find().exec()

                const agent = await Agent.findOne({ principalAddress: lender }).exec()

                const { status, data: lenderLoanModel } = await axios.get(`${agent.url}/loans/contract/${principal}/${loanId}`)
                const { status: lenderLoanStatus } = lenderLoanModel

                // if it can't be reached or status currently isn't ACCEPTING / ACCEPTED then do something
                if (!(status === 200 && (lenderLoanStatus === 'ACCEPTING' || lenderLoanStatus === 'ACCEPTED'))) {
                  await agenda.now('accept-or-cancel-loan', { loanModelId: loan.id })
                }
              } else {
                await agenda.now('accept-or-cancel-loan', { loanModelId: loan.id })
              }
            } else if (sale) {
              const saleModel = await Sale.findOne({ loanModelId: loan.id }).exec()

              if (isArbiter() && saleModel && saleModel.status !== 'FAILED') {
                const collateralBlockHeight = await saleModel.collateralClient().getMethod('getBlockHeight')()
                const { latestCollateralBlock, claimTxHash, status } = saleModel

                if (saleModel && collateralBlockHeight > latestCollateralBlock && !claimTxHash) {
                  agenda.now('verify-collateral-claim', { saleModelId: saleModel.id })
                } else if (saleModel && status === 'COLLATERAL_CLAIMED' && claimTxHash) {
                  console.log('COLLATERAL WAS CLAIMED, SPIN UP JOB TO ACCEPT')
                  agenda.now('accept-sale', { saleModelId: saleModel.id })
                }
              } else if (!isArbiter() && !saleModel) {
                await agenda.now('init-liquidation', { loanModelId: loan.id })
              }
            } else if (off) {
              loan.status = 'ACCEPTED'
              await loan.save()
              console.log('LOAN IS ACCEPTED, CANCELLED, OR REFUNDED')
            }
          }
        }
      }

      done()
    } catch(e) {
      console.log('ERROR')
      console.log(e)
      done()
    }
  })
}

module.exports = {
  defineLoanStatusJobs
}
