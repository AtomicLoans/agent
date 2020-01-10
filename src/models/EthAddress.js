const mongoose = require('mongoose')

const EthAddressSchema = new mongoose.Schema({
  address: {
    type: String,
    index: true
  },
  emails: [{
    type: mongoose.Schema.Types.ObjectId, ref: 'Email'
  }]
})

EthAddressSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

EthAddressSchema.static('fromEthAddress', function (address) {
  return new EthAddress({
    address
  })
})

const EthAddress = mongoose.model('EthAddress', EthAddressSchema)
module.exports = EthAddress
