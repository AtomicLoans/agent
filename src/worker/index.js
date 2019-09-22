const mongoose = require('mongoose')
const Agenda = require('agenda')

const agenda = new Agenda({ mongo: mongoose.connection })

const { defineSwapJobs } = require('./swap/index')
const { defineLoanJobs } = require('./loan/index')

agenda.maxConcurrency(1000)
agenda.defaultConcurrency(1000)

async function start () {
  await agenda.start()
  await agenda.every('30 seconds', 'update-market-data')

  if (process.env.PARTY === 'arbiter') {
    await agenda.every(process.env.ARBITER_STATUS_INTERVAL, 'check-arbiter-status')
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
