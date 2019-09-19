const Loan = require('../../../models/Loan')
const EthTx = require('../../../models/EthTx')
const { numToBytes32 } = require('../../../utils/finance')
const { loadObject } = require('../../../utils/contracts')
const { ensure0x, remove0x } = require('@liquality/ethereum-utils')
const keccak256 = require('keccak256')
const { currencies } = require('../../../utils/fx')
const clients = require('../../../utils/clients')
const BN = require('bignumber.js')
const { getMarketModels } = require('../utils/models')
const { getLockArgs, getCollateralAmounts } = require('../utils/collateral')
const { setTxParams } = require('../utils/web3Transaction')
const web3 = require('../../../utils/web3')
const { fromWei, hexToNumber } = web3().utils

function defineLoanAcceptOrCancelJobs (agenda) {
  agenda.define('accept-or-cancel-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')

    const { loanId, principal, collateral, lenderPrincipalAddress, lenderSecrets } = loan

    const { loanMarket } = await getMarketModels(principal, collateral)
    const { minConf } = loanMarket

    const loans = await loadObject('loans', process.env[`${principal}_LOAN_LOANS_ADDRESS`])
    const { off, paid, withdrawn } = await loans.methods.bools(numToBytes32(loanId)).call()

    // TODO: reformat console.log statements
    if (!off && (!withdrawn || paid)) {
      loans.methods.accept(numToBytes32(loanId), ensure0x(lenderSecrets[0])).send({ from: ensure0x(lenderPrincipalAddress), gas: 1000000 })
        .on('transactionHash', (transactionHash) => {
          if (paid) {
            console.log('ACCEPTING')
            loan.status = 'ACCEPTING'
          } else {
            console.log('CANCELLING')
            loan.status = 'CANCELLING'
          }

          loan.save()
        })
        .on('confirmation', async (confirmationNumber, receipt) => {
          if (confirmationNumber === minConf) {
            if (paid) {
              console.log('ACCEPTED')
              loan.status = 'ACCEPTED'
            } else {
              console.log('CANCELLED')
              loan.status = 'CANCELLED'
            }

            loan.save()
            done()
          }
        })
        .on('error', (error) => {
          console.log(error)
          done()
        })

      done()
    } else {
      console.log(`Loan wasn't accepted or cancelled because off: ${off}, withdrawn: ${withdrawn}, paid: ${paid}}`)
    }
  })
}

module.exports = {
  defineLoanAcceptOrCancelJobs
}
