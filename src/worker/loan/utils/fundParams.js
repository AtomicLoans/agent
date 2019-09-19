const web3 = require('web3')
const { ensure0x } = require('@liquality/ethereum-utils')
const { currencies } = require('../../../utils/fx')
const { rateToSec } = require('../../../utils/finance')
const { getMarketModels } = require('./models')
const { toWei } = web3.utils

async function getFundParams (fund) {
  const {
    principal, collateral, custom
  } = fund

  const { loanMarket } = await getMarketModels(principal, collateral)
  const { principalAddress } = await loanMarket.getAgentAddresses()
  const lenderAddress = ensure0x(principalAddress)

  const unit = currencies[principal].unit

  let fundParams
  if (custom) {
    fundParams = getCustomFundParams(fund, lenderAddress, unit, loanMarket)
  } else {
    fundParams = getRegularFundParams(fund, lenderAddress, unit)
  }

  return { fundParams, lenderAddress }
}

function getRegularFundParams (fund, lenderAddress, unit) {
  const { maxLoanDuration, fundExpiry, compoundEnabled, amountToDepositOnCreate } = fund

  return [
    maxLoanDuration,
    fundExpiry,
    process.env.ETH_ARBITER,
    compoundEnabled,
    toWei(amountToDepositOnCreate.toString(), unit)
  ]
}

function getCustomFundParams (fund, lenderAddress, unit, loanMarket) {
  const {
    maxLoanDuration, fundExpiry, compoundEnabled, liquidationRatio, interest, penalty, fee, amountToDepositOnCreate
  } = fund
  const { minPrincipal, maxPrincipal, minLoanDuration } = loanMarket

  return [
    toWei(minPrincipal.toString(), unit),
    toWei(maxPrincipal.toString(), unit),
    minLoanDuration,
    maxLoanDuration,
    fundExpiry,
    toWei((liquidationRatio / 100).toString(), 'gether'), // 150% collateralization ratio
    toWei(rateToSec(interest.toString()), 'gether'), // 16.50%
    toWei(rateToSec(penalty.toString()), 'gether'), //  3.00%
    toWei(rateToSec(fee.toString()), 'gether'), //  0.75%
    process.env.ETH_ARBITER,
    compoundEnabled,
    toWei(amountToDepositOnCreate.toString(), unit)
  ]
}

module.exports = {
  getFundParams
}
