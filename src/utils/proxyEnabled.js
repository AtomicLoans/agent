function isProxyEnabled () {
  return process.env.HOT_COLD_WALLET_PROXY_ENABLED
}

module.exports = {
  isProxyEnabled
}
