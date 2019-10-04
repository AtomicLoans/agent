const Sentry = require('@sentry/node')

const express = require('express')
const helmet = require('helmet')
const compression = require('compression')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const Agenda = require('agenda')
const Agendash = require('agendash')

const cors = require('../middlewares/cors')
const httpHelpers = require('../middlewares/httpHelpers')
const handleError = require('../middlewares/handleError')

const {
  PORT, MONGODB_URI, MONGODB_ARBITER_URI, PARTY
} = process.env

let agenda
if (PARTY !== 'arbiter') {
  agenda = new Agenda({ db: { address: MONGODB_URI }})
} else {
  agenda = new Agenda({ db: { address: MONGODB_ARBITER_URI }})
}

const app = express()

if (process.env.NODE_ENV === 'production') {
  app.use(Sentry.Handlers.requestHandler())
}

app.use(httpHelpers())
app.use(helmet())
app.use(cors())
app.use(compression())
app.use(bodyParser.json({ limit: '5mb' }))
app.use(bodyParser.urlencoded({ extended: true, limit: '5mb' }))
app.set('etag', false)
app.set('agenda', agenda)

app.use('/dash', Agendash(agenda));
app.use('/api/swap', require('./routes/swap'))
app.use('/api/loan', require('./routes/loan/index'))
// app.use('/queue', Agendash(agenda))

if (process.env.NODE_ENV === 'production') {
  app.use(Sentry.Handlers.errorHandler())
}

app.use(handleError())

app.listen(PORT)
