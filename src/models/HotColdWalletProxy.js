const mongoose = require('mongoose')

const HotColdWalletProxySchema = new mongoose.Schema({
  principal: {
    type: String,
    index: true
  },
  collateral: {
    type: String,
    index: true
  },
  hotWalletAddress: {
    type: String,
    index: true
  },
  coldWalletAddress: {
    type: String,
    index: true
  },
  contractAddress: {
    type: String,
    index: true,
    unique: true
  },
  status: {
    type: String,
    enum: ['DEPLOYED'],
    index: true
  }
})

HotColdWalletProxySchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

HotColdWalletProxySchema.static('fromWalletAddresses', function (params) {
  return new HotColdWalletProxy({
    principal: params.principal,
    collateral: params.collateral,
    hotWalletAddress: params.hotWalletAddress,
    coldWalletAddress: params.coldWalletAddress,
    contractAddress: params.contractAddress,
    status: 'DEPLOYED'
  })
})

const HotColdWalletProxy = mongoose.model('HotColdWalletProxy', HotColdWalletProxySchema)
module.exports = HotColdWalletProxy
