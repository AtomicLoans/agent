const mongoose = require('mongoose')

const LiquidatorSchema = new mongoose.Schema({
  ethSigner: {
    type: String,
    index: true
  },
  endpoint: {
    type: String,
    index: true
  },
  url: {
    type: String,
    index: true,
    unique: true
  },
  principalAddress: {
    type: String,
    index: true
  },
  collateralPublicKey: {
    type: String,
    index: true
  },
  ethBalance: {
    type: Number,
    index: true
  },
  version: {
    type: String,
    index: true,
    default: '0.1.17'
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    index: true
  }
})

LiquidatorSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

LiquidatorSchema.static('fromLiquidatorParams', function (params) {
  return new Liquidator({
    ethSigner: params.ethSigner,
    endpoint: params.endpoint,
    url: params.url,
    principalAddress: params.principalAddress,
    collateralPublicKey: params.collateralPublicKey,
    ethBalance: params.ethBalance,
    version: params.version,
    status: 'ACTIVE'
  })
})

const Liquidator = mongoose.model('Liquidator', LiquidatorSchema)
module.exports = Liquidator
