const mongoose = require('mongoose')
const Agenda = require('agenda')

// let mongoConnectionString, collection
// if (process.env.PARTY === 'arbiter') {
//   mongoConnectionString = 'mongodb://127.0.0.1/agenda_arbiter'
//   collection = 'arbiterCollection'
// } else {
//   mongoConnectionString = 'mongodb://127.0.0.1/agenda_lender'
//   collection = 'lenderCollection'
// }

const agenda = new Agenda({ mongo: mongoose.connection, maxConcurrency: 1000, defaultConcurrency: 1000, defaultLockLifetime: 500 })

const { getInterval } = require('../utils/intervals')

const { defineSwapJobs } = require('./swap/index')
const { defineLoanJobs } = require('./loan/index')

async function start () {
  await agenda.purge()
  await agenda.start()
  await agenda.every('2 minutes', 'update-market-data')

  if (process.env.PARTY === 'arbiter') {
    await agenda.every(getInterval('ARBITER_STATUS_INTERVAL'), 'check-arbiter-status')
    await agenda.every(getInterval('LENDER_CHECK_INTERVAL'), 'check-lender-status')
  } else {
    await agenda.now('notify-arbiter')
  }
}

async function stop () {
  await agenda.stop()
  process.exit(0)
}

defineSwapJobs(agenda)
defineLoanJobs(agenda)

process.on('SIGTERM', stop)
process.on('SIGINT', stop)

start()
