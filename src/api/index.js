const Sentry = require('@sentry/node')

const express = require('express')
const helmet = require('helmet')
const compression = require('compression')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const Agenda = require('agenda')
const Agendash = require('agendash')
const path = require('path')
const reactViews = require('express-react-views')

const cors = require('../middlewares/cors')
const httpHelpers = require('../middlewares/httpHelpers')
const handleError = require('../middlewares/handleError')

const { migrate } = require('../migrate/migrate')

const {
  PORT, MONGODB_URI, MONGODB_ARBITER_URI, PARTY
} = process.env

let agenda
if (PARTY !== 'arbiter') {
  agenda = new Agenda({ db: { address: MONGODB_URI }})
} else {
  agenda = new Agenda({ db: { address: MONGODB_ARBITER_URI }})
}

try { migrate() }
catch(e) { console.log(e) }

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

app.set('views', __dirname + '/views');
app.set('view engine', 'js');
app.engine('js', reactViews.createEngine());

app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', require('./viewRoutes').index);

app.get('/verify', require('./viewRoutes').verify);

if (process.env.NODE_ENV === 'production') {
  app.use(Sentry.Handlers.errorHandler())
}

app.use(handleError())

app.listen(PORT)
