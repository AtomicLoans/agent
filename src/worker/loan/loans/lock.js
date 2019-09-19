const Loan = require('../../../models/Loan')

function defineLoanLockJobs (agenda) {
  agenda.define('verify-lock-collateral', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')

    if (loan.status === 'CANCELLED' || loan.status === 'CANCELLING') { done() } // Don't check if collateral locked if in the middle of canceling loan

    const { collateralRefundableP2SHAddress, collateralSeizableP2SHAddress, refundableCollateralAmount, seizableCollateralAmount } = loan

    const refundableBalance = await loan.collateralClient().chain.getBalance([collateralRefundableP2SHAddress])
    const seizableBalance = await loan.collateralClient().chain.getBalance([collateralSeizableP2SHAddress])

    const refundableUnspent = await loan.collateralClient().getMethod('getUnspentTransactions')([collateralRefundableP2SHAddress])
    const seizableUnspent = await loan.collateralClient().getMethod('getUnspentTransactions')([collateralSeizableP2SHAddress])

    const collateralRequirementsMet = (refundableBalance.toNumber() >= refundableCollateralAmount && seizableBalance.toNumber() >= seizableCollateralAmount)
    const refundableConfirmationRequirementsMet = refundableUnspent.length === 0 ? false : refundableUnspent[0].confirmations > 0
    const seizableConfirmationRequirementsMet = seizableUnspent.length === 0 ? false : seizableUnspent[0].confirmations > 0

    if (collateralRequirementsMet && refundableConfirmationRequirementsMet && seizableConfirmationRequirementsMet) {
      console.log('COLLATERAL LOCKED')

      await agenda.now('approve-loan', { loanModelId: loan.id })
    } else {
      console.log('COLLATERAL NOT LOCKED')
      // TODO: should not schedule if after approveExpiration
      // TODO: add reason for canceling (for example, cancelled because collateral wasn't sufficient)
      // TODO: check current blocktime
      agenda.schedule('in 5 seconds', 'verify-lock-collateral', { loanModelId })
      console.log('rescheduled')
    }

    done()
  })
}

module.exports = {
  defineLoanLockJobs
}
