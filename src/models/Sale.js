const mongoose = require('mongoose')

const clients = require('../utils/clients')
const { currencies } = require('../utils/fx')

const SaleSchema = new mongoose.Schema({
  loan: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Loan'
  },
  saleId: {
    type: Number
  },
  ethTxId: {
    type: String,
    index: true
  },
  collateralSwapRefundableP2SHAddress: {
    type: String,
    index: true
  },
  collateralSwapSeizableP2SHAddress: {
    type: String,
    index: true
  },
  collateralSwapRefundableAmount: {
    type: Number
  },
  collateralSwapSeizableAmount: {
    type: Number
  },
  secretB: {
    type: String
  },
  secretHashB: {
    type: String
  },
  secretC: {
    type: String
  },
  secretHashC: {
    type: String
  },
  saleToLoanIndex: {
    type: Number
  },
  status: {
    type: String,
    enum: ['INITIATED', 'COLLATERAL_SENDING', 'COLLATERAL_SENT', 'SECRETS_PROVIDED', 'COLLATERAL_CLAIMED', 'ACCEPTING', 'ACCEPTED', 'CANCELLING', 'CANCELLED', 'FAILED'],
    index: true
  }
})

SaleSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v
  // delete json.lenderSecrets // TODO Uncomment

  return json
}

SaleSchema.static('fromLoan', function (loanMarket, params, minimumCollateralAmount) {
  return new Sale({
    principal: params.principal,
    collateral: params.collateral,
    principalAmount: params.principalAmount,
    minimumCollateralAmount,
    minConf: loanMarket.minConf,
    requestLoanDuration: params.loanDuration,
    requestExpiresAt: Date.now() + loanMarket.requestExpiresIn,
    requestCreatedAt: Date.now(),
    status: 'QUOTE'
  })
})

const Sale = mongoose.model('Sale', SaleSchema)
module.exports = Sale
