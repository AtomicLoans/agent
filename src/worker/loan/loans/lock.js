const Loan = require('../../../models/Loan')
const { getCurrentTime } = require('../../../utils/time')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject } = require('../../../utils/contracts')

function defineLoanLockJobs (agenda) {
  agenda.define('verify-lock-collateral', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')

    if (loan.status === 'CANCELLED' || loan.status === 'CANCELLING') { done() } // Don't check if collateral locked if in the middle of canceling loan

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

      await agenda.now('approve-loan', { loanModelId: loan.id })
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
        await agenda.now('accept-or-cancel-loan', { loanModelId })
      } else {
        agenda.schedule('in 5 seconds', 'verify-lock-collateral', { loanModelId })
      }
    }

    done()
  })
}

module.exports = {
  defineLoanLockJobs
}
