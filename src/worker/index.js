const mongoose = require('mongoose')
const Agenda = require('agenda')

const agenda = new Agenda({ mongo: mongoose.connection, maxConcurrency: 1000, defaultConcurrency: 1000, defaultLockLifetime: 500 })

const { getInterval } = require('../utils/intervals')

const { defineSwapJobs } = require('./swap/index')
const { defineLoanJobs } = require('./loan/index')

async function start () {
  await agenda.start()

  await agenda.every('2 minutes', 'update-market-data')

  await agenda.every(getInterval('CHECK_ALL_RECORDS_INTERVAL'), 'check-loan-statuses-and-update')
  if (process.env.PARTY === 'arbiter') {
    await agenda.every(getInterval('ARBITER_STATUS_INTERVAL'), 'check-arbiter-status')
    await agenda.every(getInterval('LENDER_CHECK_INTERVAL'), 'check-lender-status')
  } else {
    // TODO: check every 30 seconds to changes to open loans and react
    await agenda.now('notify-arbiter')
  }

  await agenda.every(getInterval('SANITIZE_TX_INTERVAL'), 'sanitize-eth-txs')

  agenda.define('restart', async (job, done) => {
    await start()
    done()
  })
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
