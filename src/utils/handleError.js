var bugsnag = require('@bugsnag/js')

var bugsnagClient = bugsnag(process.env.BUGSNAG_API)

function handleError (e) {
  bugsnagClient.notify(e)
}

module.exports = handleError
