const Loan = require('../../../models/Loan')
const LoanMarket = require('../../../models/LoanMarket')
const { numToBytes32 } = require('../../../utils/finance')
const { getCurrentTime } = require('../../../utils/time')
const { getObject } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')

function defineLoanStatusJobs (agenda) {
  agenda.define('check-loan-status-ish', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')

    const { loanId, principal } = loan
    const loans = getObject('loans', principal)
    const { withdrawn, sale, paid, off } = await loans.methods.bools(numToBytes32(loanId)).call()

    if (!withdrawn && !paid && !sale && !off) {
      await agenda.schedule(getInterval('REPAID_TX_INTERVAL'), 'check-loan-status-ish', { loanModelId })
      done()
    } else if (withdrawn && !paid && !sale && !off) {
      loan.status = 'WITHDRAWN'
      await loan.save()
      await agenda.schedule(getInterval('REPAID_TX_INTERVAL'), 'check-loan-status-ish', { loanModelId })
      done()
    } else if (withdrawn && paid && !sale && !off) {
      loan.status = 'REPAID'
      await loan.save()
      await agenda.now('accept-or-cancel-loan', { loanModelId })
    } else if (sale) {
      // TODO: start liquidation process
      console.log('LIQUIDATION HAS STARTED')
    } else if (off) {
      console.log('LOAN IS ACCEPTED, CANCELLED, OR REFUNDED')
    }
    done()
  })

  agenda.define('check-loan-statuses-ish', async (job, done) => {
    const loanMarkets = await LoanMarket.find().exec()

    for (let i = 0; i < loanMarkets.length; i++) {
      const loanMarket = loanMarkets[i]
      const { principal } = loanMarket
      const loans = getObject('loans', principal)

      const loanModels = await Loan.find({ status: { $nin: [ 'QUOTE', 'REQUESTING', 'CANCELLING', 'CANCELLED', 'ACCEPTING', 'ACCEPTED', 'FAILED' ] }})

      for (let j = 0; j < loanModels.length; j++) {
        const loan = loanModels[j]
        const { loanId } = loan

        const { approved, withdrawn, sale, paid, off } = await loans.methods.bools(numToBytes32(loanId)).call()

        console.log('bools', approved, withdrawn, sale, paid, off)

        if (!approved && !withdrawn && !paid && !sale && !off) {
          // CHECK LOCK COLLATERAL
          console.log('Not approved')
          
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

            await agenda.schedule(getInterval('ACTION_INTERVAL'), 'approve-loan', { loanModelId: loan.id })
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

            if (currentTime > approveExpiration && !approved) {
              await agenda.schedule(getInterval('ACTION_INTERVAL'), 'accept-or-cancel-loan', { loanModelId })
            }
          }
          
        } else if (withdrawn && !paid && !sale && !off) {
          loan.status = 'WITHDRAWN'
          await loan.save()
        } else if (withdrawn && paid && !sale && !off) {
          loan.status = 'REPAID'
          await loan.save()
          await agenda.now('accept-or-cancel-loan', { loanModelId: loan.id })
        } else if (sale) {
          // TODO: start liquidation process
          console.log('LIQUIDATION HAS STARTED')
        } else if (off) {
          console.log('LOAN IS ACCEPTED, CANCELLED, OR REFUNDED')
        }
      }
    }

    done()
  })
}

module.exports = {
  defineLoanStatusJobs
}
