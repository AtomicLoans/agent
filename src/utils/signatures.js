const ethJsUtil = require('ethereumjs-util')
const { getEthSigner } = require('../../../utils/address')
const { ensure0x, checksumEncode } = require('@liquality/ethereum-utils')

function verifySignature (signature, message, address) {
  const msgBuffer = ethJsUtil.toBuffer(message)
  const msgHash = ethJsUtil.hashPersonalMessage(msgBuffer)
  const signatureBuffer = ethJsUtil.toBuffer(ensure0x(signature))
  const signatureParams = ethJsUtil.fromRpcSig(signatureBuffer)
  const publicKey = ethJsUtil.ecrecover(
    msgHash,
    signatureParams.v,
    signatureParams.r,
    signatureParams.s
  )
  const addressBuffer = ethJsUtil.publicToAddress(publicKey)
  const addressFromSignature = ethJsUtil.bufferToHex(addressBuffer)

  return checksumEncode(address) === checksumEncode(addressFromSignature)
}

function verifyTimestampedSignature (signature, message, timestamp) {
  const currentTime = Math.floor(new Date().getTime() / 1000)
  const address = getEthSigner()

  if (!verifySignature(signature, message, address)) { throw new Error('Signature doesn\'t match address') }
  if (!(message === `Cancel all loans for ${address} at ${timestamp}`)) { throw new Error('Message doesn\'t match params') }
  if (!(currentTime <= (timestamp + 60))) { throw new Error('Signature is stale') }
  if (!(currentTime >= (timestamp - 120))) { throw new Error('Timestamp is too far ahead in the future') }
  if (!(typeof timestamp === 'number')) { throw new Error('Timestamp is not a number') }
}

module.exports = {
  verifySignature,
  verifyTimestampedSignature
}
