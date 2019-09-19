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

function defineLoanApproveJobs (agenda) {
  agenda.define('approve-loan', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    if (!loan) return console.log('Error: Loan not found')

    const { loanId, principal, collateral, lenderPrincipalAddress } = loan

    const { loanMarket } = await getMarketModels(principal, collateral)
    const { minConf } = loanMarket

    const loans = await loadObject('loans', process.env[`${principal}_LOAN_LOANS_ADDRESS`])

    const approved = await loans.methods.approved(numToBytes32(loanId)).call()

    if (approved) {
      console.log('Loan already approved')
      done()
    } else {
      // TODO: change to use web3 transaction
      loans.methods.approve(numToBytes32(loanId)).send({ from: ensure0x(lenderPrincipalAddress), gas: 1000000 })
        .on('transactionHash', (transactionHash) => {
          loan.approveTxHash = transactionHash
          console.log('APPROVING')
          loan.status = 'APPROVING'
          loan.save()
        })
        .on('confirmation', async (confirmationNumber, receipt) => {
          if (confirmationNumber === minConf) {
            console.log('APPROVED')
            loan.status = 'APPROVED'
            loan.save()
            done()
          }
        })
        .on('error', (error) => {
          console.log(error)
          done()
        })

      done()
    }
  })
}

module.exports = {
  defineLoanApproveJobs
}
