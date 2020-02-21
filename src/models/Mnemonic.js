const mongoose = require('mongoose')

const MnemonicSchema = new mongoose.Schema({
  mnemonic: {
    type: String
  },
  heroku_api_key: {
    type: String
  },
  autoupdateEnabled: {
    type: Boolean,
    default: true
  }
})

MnemonicSchema.methods.json = function () {
  const json = this.toJSON()

  delete json._id
  delete json.__v
  delete json.mnemonic
  delete json.heroku_api_key

  return json
}

const Mnemonic = mongoose.model('Mnemonic', MnemonicSchema)
module.exports = Mnemonic
