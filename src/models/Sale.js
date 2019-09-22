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
  status: {
    type: String,
    enum: ['QUOTE', 'REQUESTING', 'AWAITING_COLLATERAL', 'APPROVING', 'APPROVED', 'CANCELLING', 'CANCELLED', 'WITHDRAWN', 'REPAID', 'ACCEPTING', 'ACCEPTED', 'FAILED'],
    index: true
  }
})

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
