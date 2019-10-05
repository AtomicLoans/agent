const mongoose = require('mongoose')

const MnemonicSchema = new mongoose.Schema({
  mnemonic: {
    type: String
  }
})

const Mnemonic = mongoose.model('Mnemonic', MnemonicSchema)
module.exports = Mnemonic
