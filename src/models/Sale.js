const mongoose = require('mongoose')
const { remove0x } = require('@liquality/ethereum-utils')

const clients = require('../utils/clients')
const { currencies } = require('../utils/fx')

const SaleSchema = new mongoose.Schema({
  loan: {
    type: mongoose.Schema.Types.ObjectId, ref: 'Loan'
  },
  saleId: {
    type: Number
  },
  loanModelId: {
    type: String,
    index: true
  },
  ethTxId: {
    type: String,
    index: true
  },
  principal: {
    type: String,
    index: true
  },
  collateral: {
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
  initTxHash: {
    type: String,
    index: true
  },
  claimTxHash: {
    type: String,
    index: true
  },
  acceptTxHash: {
    type: String,
    index: true
  },
  revertTxhash: {
    type: String,
    index: true
  },
  latestCollateralBlock: {
    type: Number,
    index: true
  },
  status: {
    type: String,
    enum: ['INITIATED', 'COLLATERAL_SENDING', 'COLLATERAL_SENT', 'SECRETS_PROVIDED', 'COLLATERAL_CLAIMED', 'COLLATERAL_REVERTING', 'COLLATERAL_REVERTED', 'ACCEPTING', 'ACCEPTED', 'CANCELLING', 'CANCELLED', 'FAILED'],
    index: true,
    default: 'INITIATED'
  }
})

SaleSchema.index({ principal: 1, saleId: 1 }, { unique: true, partialFilterExpression: { principal: { $type: 'string' }, saleId: { $type: 'int' } } })

SaleSchema.methods.principalClient = function () {
  return clients[currencies[this.principal].chain]
}

SaleSchema.methods.collateralClient = function () {
  return clients[this.collateral]
}

SaleSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

SaleSchema.static('fromParams', function (params) {
  return new Sale({
    principal: params.principal,
    collateral: params.collateral,
    collateralSwapRefundableP2SHAddress: params.refundableSwapAddress,
    collateralSwapSeizableP2SHAddress: params.seizableSwapAddress,
    secretHashB: remove0x(params.secretHashB),
    secretHashC: remove0x(params.secretHashC),
    saleToLoanIndex: params.saleIndexByLoan,
    saleId: params.saleId,
    loanModelId: params.loanModelId,
    status: 'INITIATED'
  })
})

const Sale = mongoose.model('Sale', SaleSchema)
module.exports = Sale
