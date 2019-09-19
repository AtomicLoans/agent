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

function defineLoanRepayJobs (agenda) {
  agenda.define('check-loan-repaid', async (job, done) => {
    const { data } = job.attrs
    const { loanModelId } = data

    // TODO: complete check loan repaid
  })
}

module.exports = {
  defineLoanRepayJobs
}
