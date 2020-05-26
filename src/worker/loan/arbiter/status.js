const log = require('@mblackmblack/node-pretty-log')

const LoanMarket = require('../../../models/LoanMarket')
const Secrets = require('../../../models/Secrets')
const { getObject } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')

function defineArbiterStatusJobs (agenda) {
  agenda.define('check-arbiter-status', async (job, done) => {
    log('info', 'Check Arbiter Status Job | Starting')

    const loanMarkets = await LoanMarket.find().exec()

    for (let i = 0; i < loanMarkets.length; i++) {
      const loanMarket = loanMarkets[i]
      const { principal } = loanMarket
      const { principalAddress } = await loanMarket.getAgentAddresses()

      log('info', `Check Arbiter Status Job | ${principal} Loan Market with ${principalAddress ? 'Principal Address: ' + principalAddress : 'no Principal Address'}`)

      if (principalAddress) {
        const funds = getObject('funds', principal)
        const loans = getObject('loans', principal)

        const [secretHashesCount, secretHashIndex, pubKey, loanIndex] = await Promise.all([
          funds.methods.secretHashesCount(principalAddress).call(),
          funds.methods.secretHashIndex(principalAddress).call(),
          funds.methods.pubKeys(principalAddress).call(),
          loans.methods.loanIndex().call()
        ])

        const secretHashesRemaining = secretHashesCount - secretHashIndex
        const loansRemaining = secretHashesRemaining / 4

        log('info', `Check Arbiter Status Job | ${principal} Loan Market with ${loansRemaining} Loans Remaining`)

        const secretsModel = await Secrets.findOne({ secretHashesCount, principal, status: { $ne: 'FAILED' } }).exec()
        if (!secretsModel) {
          if (loansRemaining < parseInt(getInterval('LOAN_SECRET_HASH_COUNT'))) {
            agenda.now('add-secrets-hashes', { loanMarketId: loanMarket.id })
          }
        }

        if (!pubKey) {
          agenda.now('set-pubkey', { loanMarketId: loanMarket.id })
        }

        if (loanMarket.loanIndex < loanIndex) {
          agenda.now('update-loan-records', { loanMarketId: loanMarket.id })
        }
      }
    }

    // TODO: enable log for entire status rather than individual logs for each action

    done()
  })
}

module.exports = {
  defineArbiterStatusJobs
}
