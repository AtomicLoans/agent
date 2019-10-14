const _ = require('lodash')
const axios = require('axios')
const asyncHandler = require('express-async-handler')
const { checksumEncode } = require('@liquality/ethereum-utils')
const { getEthSigner } = require('../../../utils/address')
const { verifySignature } = require('../../../utils/signatures')
const LoanMarket = require('../../../models/LoanMarket')
var wget = require('node-wget')
var extract = require('extract-zip')

const ncp = require('ncp').ncp
ncp.limit = 16

const { HEROKU_APP } = process.env

function defineAgentRoutes (router) {
  router.get('/loanmarketinfo', asyncHandler(async (req, res) => {
    const { query } = req
    const q = _.pick(query, ['collateral', 'principal'])

    const result = await LoanMarket.find(q).exec()

    res.json(result.map(r => r.json()))
  }))

  router.get('/loanmarkets/ticker/:principal', asyncHandler(async (req, res, next) => {
    const { params } = req
    const { principal } = params

    const loanMarket = await LoanMarket.findOne({ principal }).exec()
    if (!loanMarket) return next(res.createError(401, 'LoanMarket not found'))

    res.json(loanMarket.json())
  }))

  router.get('/agentinfo/:marketId', asyncHandler(async (req, res) => {
    const { params } = req

    const loanMarket = await LoanMarket.findOne({ _id: params.marketId }).exec()

    const agentAddresses = await loanMarket.getAgentAddresses()

    res.json(agentAddresses)
  }))

  router.get('/agentinfo/ticker/:principal/:collateral', asyncHandler(async (req, res) => {
    const { params } = req
    const { principal, collateral } = params

    const loanMarket = await LoanMarket.findOne({ principal, collateral }).exec()

    const agentAddresses = await loanMarket.getAgentAddresses()

    res.json(agentAddresses)
  }))

  router.post('/backupseedphrase', asyncHandler(async (req, res, next) => {
    const currentTime = Math.floor(new Date().getTime() / 1000)
    const address = getEthSigner()

    const { body } = req
    const { signature, message, timestamp } = body

    if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))
    if (!(message === `Get Mnemonic for ${address} at ${timestamp}`)) return next(res.createError(401, 'Message doesn\'t match params'))
    if (!(currentTime <= (timestamp + 60))) return next(res.createError(401, 'Signature is stale'))

    res.json({ mnemonic: process.env.MNEMONIC })
  }))

  if ((HEROKU_APP !== undefined && HEROKU_APP !== 'undefined') || process.env.NODE_ENV === 'test') {
    const Mnemonic = require('../../../models/Mnemonic')

    router.post('/set_heroku_api_key', asyncHandler(async (req, res, next) => {
      const currentTime = Math.floor(new Date().getTime() / 1000)
      const address = getEthSigner()

      const { body } = req
      const { signature, message, timestamp, key } = body

      if (!verifySignature(signature, message, address)) return next(res.createError(401, 'Signature doesn\'t match address'))
      if (!(message === `Set Heroku API Key ${key} at ${timestamp}`)) return next(res.createError(401, 'Message doesn\'t match params'))
      if (!(currentTime <= (timestamp + 60))) return next(res.createError(401, 'Signature is stale'))

      const mnemonics = await Mnemonic.find().exec()
      if (mnemonics.length > 0) {
        const mnemonic = mnemonics[0]
        mnemonic.heroku_api_key = key
        await mnemonic.save()
        res.json({ message: 'Success' })
      } else {
        return next(res.createError(401, 'Mnemonic not set'))
      }
    }))

    router.get('/update', asyncHandler(async (req, res, next) => {
      const mnemonics = await Mnemonic.find().exec()
      console.log('test1')
      if (mnemonics.length > 0) {
        const mnemonic = mnemonics[0]
        const { heroku_api_key: token } = mnemonic

        console.log('test2', token)

        const { status, data: release } = await axios.get('https://api.github.com/repos/AtomicLoans/agent/releases/latest')

        if (status === 200) {
          const { name } = release

          console.log('test3')

          const params = { 'source_blob': { 'url': `https://github.com/AtomicLoans/agent/archive/${name}.tar.gz` } }
          const config = {
            headers: {
              'Accept': 'application/vnd.heroku+json; version=3',
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          }

          console.log(`https://api.heroku.com/apps/${HEROKU_APP}/builds`)
          console.log('params', params)
          console.log('config', config)

          const herokuResult = await axios.post(`https://api.heroku.com/apps/${HEROKU_APP}/builds`, params, config)
          console.log('herokuResult', herokuResult)
          const { status: herokuStatus } = herokuResult

          if (herokuStatus === 201) {
            res.json({ message: 'Success' })
          } else {
            console.log('Heroku error')
            return next(res.createError(401, 'Heroku error'))
          }
        } else {
          console.log('Github error')
          return next(res.createError(401, 'Github error'))
        }
      } else {
        console.log('Mnemonic not set')
        return next(res.createError(401, 'Mnemonic not set'))
      }
    }))
  }

  if (process.env.NODE_ENV === 'test') {
    router.post('/bitcoin/generate_block', asyncHandler(async (req, res) => {
      const { body } = req
      const { nblocks } = body

      const loanMarkets = await LoanMarket.find().exec()
      const loanMarket = loanMarkets[0]

      const blocks = await loanMarket.collateralClient().getMethod('jsonrpc')('generate', parseInt(nblocks))

      res.json({ blocks })
    }))

    router.post('/bitcoin/import_addresses', asyncHandler(async (req, res) => {
      const { body } = req
      const { addresses } = body

      const { importBitcoinAddressesByAddress } = require('../../../../test/common')

      await importBitcoinAddressesByAddress(addresses)

      res.json({ message: 'success' })
    }))
  }
}

module.exports = defineAgentRoutes
