if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const { MONGOOSE_DEBUG, MONGODB_ARBITER_URI, MONGODB_URI, HEROKU_APP, NODE_ENV, MNEMONIC, MNEMONIC_ARBITER, PARTY } = process.env

const { isArbiter, rewriteEnv, getEnvTestValue } = require('./utils/env')
const mongoose = require('mongoose')
const { generateMnemonic } = require('bip39')

if (MONGOOSE_DEBUG === 'true') {
  mongoose.set('debug', true)
}

mongoose.connect(isArbiter() ? MONGODB_ARBITER_URI : MONGODB_URI, { useNewUrlParser: true, useCreateIndex: true })

async function start() {
  if (HEROKU_APP !== undefined && HEROKU_APP !== 'undefined') {
    const Mnemonic = require('./models/Mnemonic')

    const mnemonics = await Mnemonic.find().exec()
    if (mnemonics.length > 0) {
      const mnemonic = mnemonics[0]
      process.env.MNEMONIC = mnemonic.mnemonic
    } else {
      const mnemonic = new Mnemonic({ mnemonic: MNEMONIC })
      await mnemonic.save()
    }
  }

  if (NODE_ENV === 'test') {
    if (PARTY === 'arbiter') {
      if (MNEMONIC_ARBITER === 'undefined' || MNEMONIC_ARBITER === undefined || MNEMONIC_ARBITER === '') {
        const mnemonic = generateMnemonic(128)
        rewriteEnv('.env', 'MNEMONIC_ARBITER', `"${mnemonic}"`)
        process.env.MNEMONIC_ARBITER = mnemonic
      }
    } else if (PARTY === 'lender') {
      if (MNEMONIC === 'undefined' || MNEMONIC === undefined || MNEMONIC === '') {
        const mnemonic = generateMnemonic(128)
        rewriteEnv('.env', 'MNEMONIC', `"${mnemonic}"`)
        process.env.MNEMONIC = mnemonic
      }
    }

    if (getEnvTestValue('ETH_SIGNER_MNEMONIC').toString() === '') {
      rewriteEnv('test/env/.env.test', 'ETH_SIGNER_MNEMONIC', `"${generateMnemonic(128)}"`)
    }

    if (getEnvTestValue('LENDER_MNEMONIC').toString() === '') {
      rewriteEnv('test/env/.env.test', 'LENDER_MNEMONIC', `"${generateMnemonic(128)}"`)
    }

    if (getEnvTestValue('BORROWER_MNEMONIC').toString() === '') {
      rewriteEnv('test/env/.env.test', 'BORROWER_MNEMONIC', `"${generateMnemonic(128)}"`)
    }

    if (getEnvTestValue('ARBITER_MNEMONIC').toString() === '') {
      rewriteEnv('test/env/.env.test', 'ARBITER_MNEMONIC', `"${generateMnemonic(128)}"`)
    }

    if (getEnvTestValue('LIQUIDATOR_MNEMONIC').toString() === '') {
      rewriteEnv('test/env/.env.test', 'LIQUIDATOR_MNEMONIC', `"${generateMnemonic(128)}"`)
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
