if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const { MONGOOSE_DEBUG, MONGODB_ARBITER_URI, MONGODB_URI, HEROKU_APP } = process.env
const { isArbiter } = require('./utils/env')
const mongoose = require('mongoose')

if (MONGOOSE_DEBUG === 'true') {
  mongoose.set('debug', true)
}

mongoose.connect(isArbiter() ? MONGODB_ARBITER_URI : MONGODB_URI, { useNewUrlParser: true, useCreateIndex: true })

async function start() {
  if (HEROKU_APP !== undefined && HEROKU_APP !== 'undefined') {
    const Mnemonic = require('./models/Mnemonic')

    console.log('heroku app')

    const mnemonics = await Mnemonic.find().exec()
    if (mnemonics.length > 0) {
      const mnemonic = mnemonics[0]
      process.env.MNEMONIC = mnemonic.mnemonic
    } else {
      const mnemonic = new Mnemonic({ mnemonic: process.env.MNEMONIC })
      await mnemonic.save()
    }
  }

  switch (process.env.PROCESS_TYPE) {
    case 'api':
      require('./api')
      break

    case 'worker':
      require('./worker')
      break

    case 'migrate':
      require('./migrate')
      break

    default:
      throw new Error('Unknown PROCESS_TYPE')
  }
}

start()
