const BN = require('bignumber.js')
const web3 = require('web3')
const { ensure0x, remove0x } = require('@liquality/ethereum-utils')
const { loadObject } = require('../../../utils/contracts')
const clients = require('../../../utils/clients')
const { currencies } = require('../../../../src/utils/fx')

const { fromWei } = web3.utils

async function getLockArgs (loanId, principal, collateral) {
  const loans = await loadObject('loans', process.env[`${principal}_LOAN_LOANS_ADDRESS`])

  const { borrowerPubKey, lenderPubKey, arbiterPubKey } = await loans.methods.pubKeys(loanId).call()
  const { secretHashA1, secretHashB1, secretHashC1 } = await loans.methods.secretHashes(loanId).call()
  const approveExpiration = await loans.methods.approveExpiration(loanId).call()
  const liquidationExpiration = await loans.methods.liquidationExpiration(loanId).call()
  const seizureExpiration = await loans.methods.seizureExpiration(loanId).call()

  const pubKeys = { borrowerPubKey: remove0x(borrowerPubKey), lenderPubKey: remove0x(lenderPubKey), agentPubKey: remove0x(arbiterPubKey) }
  const secretHashes = { secretHashA1: remove0x(secretHashA1), secretHashB1: remove0x(secretHashB1), secretHashC1: remove0x(secretHashC1) }
  const expirations = { approveExpiration, liquidationExpiration, seizureExpiration }

  return [ pubKeys, secretHashes, expirations ]
}

async function getCollateralAmounts (loanId, loan, rate) {
  const { principal, collateral, collateralAmount } = loan
  const loans = await loadObject('loans', process.env[`${principal}_LOAN_LOANS_ADDRESS`])

  const unit = currencies[principal].unit
  const colDecimals = currencies[collateral].decimals

  const owedForLoanInWei = await loans.methods.owedForLoan(loanId).call()
  const owedForLoan = fromWei(owedForLoanInWei, currencies[principal].unit)

  const seizableCollateral = BN(owedForLoan).dividedBy(rate).toFixed(colDecimals)
  const refundableCollateral = BN(collateralAmount).minus(seizableCollateral).toFixed(colDecimals)

  return { seizableCollateral, refundableCollateral }
}

module.exports = {
  getLockArgs,
  getCollateralAmounts
}
