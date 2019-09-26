const Loan = require('../../../models/Loan')
const { numToBytes32 } = require('../../../utils/finance')
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
}

module.exports = {
  defineLoanStatusJobs
}
