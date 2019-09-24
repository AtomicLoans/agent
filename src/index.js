if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config()
}

const { MONGOOSE_DEBUG, MONGODB_ARBITER_URI, MONGODB_URI } = process.env
const { isArbiter } = require('./utils/env')
const mongoose = require('mongoose')

if (MONGOOSE_DEBUG === 'true') {
  mongoose.set('debug', true)
}

mongoose.connect(isArbiter() ? MONGODB_ARBITER_URI : MONGODB_URI, { useNewUrlParser: true, useCreateIndex: true })

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
