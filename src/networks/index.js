const kovanAddresses = require('../config/addresses/kovan.json')
const kovanEndpoints = require('../config/endpoints/kovan.json')
const kovanIntervals = require('../config/intervals/kovan.json')

function contractAddresses (network) {
  if (network === 'kovan') {
    return kovanAddresses
  } else if (network === 'test') {
    const testAddresses = require('../config/addresses/test.json')
    return testAddresses
  }
}

function endpoints (network) {
  if (network === 'kovan') {
    return kovanEndpoints
  } else if (network === 'test') {
    const testEndpoints = require('../config/endpoints/test.json')
    return testEndpoints
  }
}

function intervals (network) {
  if (network === 'kovan') {
    return kovanIntervals
  } else if (network === 'test') {
    const testIntervals = require('../config/intervals/test.json')
    return testIntervals
  }
}

module.exports = {
  contractAddresses,
  intervals
}