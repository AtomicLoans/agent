const _ = require('lodash')
const axios = require('axios')
const moment = require('moment')
const asyncHandler = require('express-async-handler')
const { verifyTimestampedSignature, verifySignature } = require('../../../utils/signatures')
const LoanMarket = require('../../../models/LoanMarket')
const { version } = require('../../../../package.json')
const { getEthSigner } = require('../../../utils/address')
const { getEndpoint } = require('../../../utils/endpoints')

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
    const { body } = req
    const { signature, message, timestamp } = body
    const address = getEthSigner()

    try {
      verifyTimestampedSignature(signature, message, `Get Mnemonic for ${address} at ${timestamp}`, timestamp)
    } catch (e) {
      return next(res.createError(401, e.message))
    }

    res.json({ mnemonic: process.env.MNEMONIC })
  }))

  router.get('/version', asyncHandler(async (req, res) => {
    res.json({ version })
  }))

  if ((HEROKU_APP !== undefined && HEROKU_APP !== 'undefined') || process.env.NODE_ENV === 'test') {
    const Mnemonic = require('../../../models/Mnemonic')

    router.post('/set_heroku_api_key', asyncHandler(async (req, res, next) => {
      const { body } = req
      const { signature, message, timestamp, key } = body

      try {
        verifyTimestampedSignature(signature, message, `Set Heroku API Key ${key} at ${timestamp}`, timestamp)
      } catch (e) {
        return next(res.createError(401, e.message))
      }

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

    router.post('/update', asyncHandler(async (req, res, next) => {
      const { body } = req
      const { signature, message, timestamp } = body

      try {
        verifyTimestampedSignature(signature, message, `Update Autopilot Agent at ${timestamp}`, timestamp)
      } catch (e) {
        return next(res.createError(401, e.message))
      }

      const mnemonics = await Mnemonic.find().exec()
      if (mnemonics.length > 0) {
        const mnemonic = mnemonics[0]
        const { heroku_api_key: apiKey } = mnemonic

        if (apiKey) {
          const { status, data: release } = await axios.get('https://api.github.com/repos/AtomicLoans/agent/releases/latest')

          if (status === 200) {
            const { name } = release

            const params = { source_blob: { url: `https://github.com/AtomicLoans/agent/archive/${name}.tar.gz` } }
            const config = {
              headers: {
                Accept: 'application/vnd.heroku+json; version=3',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
              }
            }

            const { status: herokuStatus } = await axios.post(`https://api.heroku.com/apps/${HEROKU_APP}/builds`, params, config)

            if (herokuStatus === 201) {
              res.json({ message: 'Success' })
            } else {
              return next(res.createError(401, 'Heroku error'))
            }
          } else {
            return next(res.createError(401, 'Github error'))
          }
        } else {
          return next(res.createError(401, 'Heroku API Key not set'))
        }
      } else {
        return next(res.createError(401, 'Mnemonic not set'))
      }
    }))

    router.post('/autoupdate', asyncHandler(async (req, res, next) => {
      const mnemonics = await Mnemonic.find().exec()
      if (!(mnemonics.length > 0)) return next(res.createError(401, 'Mnemonic not set'))

      const mnemonic = mnemonics[0]
      const { heroku_api_key: apiKey, autoupdateEnabled } = mnemonic

      if (!autoupdateEnabled) return next(res.createError(401, 'Autoupdate is not enabled'))

      const { body } = req
      const { signature, message, timestamp } = body

      const { data: { principalAddress: arbiterAddress } } = await axios.get(`${getEndpoint('ARBITER_ENDPOINT')}/agentinfo/ticker/USDC/BTC`)
      const loanMarket = await LoanMarket.findOne().exec()
      const { principalAddress } = await loanMarket.getAgentAddresses()

      const currentTime = Math.floor(new Date().getTime() / 1000)
      if (!verifySignature(signature, message, arbiterAddress)) return next(res.createError(401, 'Signature verification failed'))
      if (!(message === `Arbiter force update ${principalAddress} at ${timestamp}`)) return next(res.createError(401, 'Message doesn\'t match params'))
      if (!(currentTime <= (timestamp + 60))) return next(res.createError(401, 'Signature is stale'))
      if (!(currentTime >= (timestamp - 120))) return next(res.createError(401, 'Timestamp is too far ahead in the future'))
      if (!(typeof timestamp === 'number')) return next(res.createError(401, 'Timestamp is not a number'))

      if (apiKey) {
        const { status, data: release } = await axios.get('https://api.github.com/repos/AtomicLoans/agent/releases/latest')

        if (status === 200) {
          const { name, published_at: publishedTimestamp } = release

          const publishedTime = moment(publishedTimestamp)
          if (!moment().isAfter(publishedTime.add(10, 'minutes'))) {
            return next(res.createError(401, '3 day cooldown before a new release can be auto-updated to'))
          }

          const params = { source_blob: { url: `https://github.com/AtomicLoans/agent/archive/${name}.tar.gz` } }
          const config = {
            headers: {
              Accept: 'application/vnd.heroku+json; version=3',
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`
            }
          }

          const { status: herokuStatus } = await axios.post(`https://api.heroku.com/apps/${HEROKU_APP}/builds`, params, config)

          if (herokuStatus === 201) {
            res.json({ message: 'Success' })
          } else {
            return next(res.createError(401, 'Heroku error'))
          }
        } else {
          return next(res.createError(401, 'Github error'))
        }
      } else {
        return next(res.createError(401, 'Heroku API Key not set'))
      }
    }))

    router.put('/autoupdate', asyncHandler(async (req, res, next) => {
      const { body } = req
      const { signature, message, timestamp, enableAutoupdate } = body
      const mnemonics = await Mnemonic.find().exec()
      if (!(mnemonics.length > 0)) return next(res.createError(401, 'Mnemonic not set'))

      const mnemonic = mnemonics[0]

      try {
        verifyTimestampedSignature(signature, message, `Set agent autoupdate (${enableAutoupdate}) at ${timestamp}`, timestamp)
      } catch (e) {
        return next(res.createError(401, e.message))
      }

      mnemonic.autoupdateEnabled = enableAutoupdate
      await mnemonic.save()
      res.json({ message: 'Success' })
    }))

    router.get('/autoupdate', asyncHandler(async (req, res, next) => {
      const mnemonics = await Mnemonic.find().exec()
      if (!(mnemonics.length > 0)) return next(res.createError(401, 'Mnemonic not set'))

      const { autoupdateEnabled } = mnemonics[0]

      res.json({ autoupdateEnabled })
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
