const _ = require('lodash')
const axios = require('axios')
const asyncHandler = require('express-async-handler')
const { verifyTimestampedSignature } = require('../../../utils/signatures')
const LoanMarket = require('../../../models/LoanMarket')
const { version } = require('../../../../package.json')

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
    let { principal, collateral } = params

    if (principal === 'DAI') {
      principal = 'SAI'
    }

    const loanMarket = await LoanMarket.findOne({ principal, collateral }).exec()

    const agentAddresses = await loanMarket.getAgentAddresses()

    res.json(agentAddresses)
  }))

  router.post('/backupseedphrase', asyncHandler(async (req, res, next) => {
    const { body } = req
    const { signature, message, timestamp } = body

    try {
      verifyTimestampedSignature(signature, message, timestamp)
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
        verifyTimestampedSignature(signature, message, timestamp)
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
        verifyTimestampedSignature(signature, message, timestamp)
      } catch (e) {
        return next(res.createError(401, e.message))
      }

      const mnemonics = await Mnemonic.find().exec()
      if (mnemonics.length > 0) {
        const mnemonic = mnemonics[0]
        const { heroku_api_key: token } = mnemonic

        if (token) {
          const { status, data: release } = await axios.get('https://api.github.com/repos/AtomicLoans/agent/releases/latest')

          if (status === 200) {
            const { name } = release

            const params = { source_blob: { url: `https://github.com/AtomicLoans/agent/archive/${name}.tar.gz` } }
            const config = {
              headers: {
                Accept: 'application/vnd.heroku+json; version=3',
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
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
