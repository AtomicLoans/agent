function isArbiter () {
  return process.env.PARTY === 'arbiter'
}

module.exports = {
  isArbiter
}
