const axios = require('axios')
const asyncHandler = require('express-async-handler')
const requestIp = require('request-ip')

const web3 = require('../../../../utils/web3')
const { fromWei } = web3().utils

const Liquidator = require('../../../../models/Liquidator')
const { verifyTimestampedSignatureUsingExpected } = require('../../../../utils/signatures')

function defineLiquidatorsRouter (router) {
  router.post('/liquidators/new', asyncHandler(async (req, res, next) => {
    console.log('start /liquidators/new')
    const { body } = req
    const { ethSigner, principalAddress, collateralPublicKey, url, signature, timestamp } = body
    const endpoint = requestIp.getClientIp(req)

    try {
      verifyTimestampedSignatureUsingExpected(signature, `Register new liquidator (${principalAddress} ${collateralPublicKey} ${ethSigner} ${url}) ${timestamp}`, timestamp, principalAddress)
    } catch (e) {
      return next(res.createError(401, e.message))
    }

    try {
      const { status, data: loanMarkets } = await axios.get(`${url}/loanmarketinfo`)
      console.log('status', status)
      console.log('loanMarkets', loanMarkets)

      if (status === 200) {
        const { data: agent } = await axios.get(`${url}/agentinfo/${loanMarkets[0].id}`)
        const { data: { version } } = await axios.get(`${url}/version`)
        console.log('agent', agent)

        const agentWithUrlExists = await Liquidator.findOne({ url }).exec()
        const agentWithEthSignerExists = await Liquidator.findOne({ ethSigner }).exec()
        const agentWithPrincipalAddressExists = await Liquidator.findOne({ principalAddress }).exec()

        if (!agentWithUrlExists && !agentWithEthSignerExists && !agentWithPrincipalAddressExists) {
          const ethBalance = await web3().eth.getBalance(principalAddress)
          const params = { ethSigner, principalAddress, collateralPublicKey, url, endpoint, ethBalance: fromWei(ethBalance.toString(), 'ether'), version }
          const agent = Liquidator.fromAgentParams(params)
          await agent.save()
          res.json(agent.json())
        } else if (!agentWithUrlExists && !agentWithEthSignerExists && agentWithPrincipalAddressExists) {
          agentWithPrincipalAddressExists.url = url
          agentWithPrincipalAddressExists.ethSigner = ethSigner
          await agentWithPrincipalAddressExists.save()
          res.json(agentWithPrincipalAddressExists.json())
        } else if (!agentWithUrlExists && agentWithEthSignerExists && !agentWithPrincipalAddressExists) {
          agentWithEthSignerExists.url = url
          agentWithEthSignerExists.principalAddress = principalAddress
          agentWithEthSignerExists.collateralPublicKey = collateralPublicKey
          await agentWithEthSignerExists.save()
          res.json(agentWithEthSignerExists.json())
        } else if (agentWithUrlExists && !agentWithEthSignerExists && !agentWithPrincipalAddressExists) {
          agentWithUrlExists.ethSigner = ethSigner
          agentWithUrlExists.principalAddress = principalAddress
          agentWithUrlExists.collateralPublicKey = collateralPublicKey
          await agentWithUrlExists.save()
          res.json(agentWithUrlExists.json())
        }
      } else { return next(res.createError(401, 'Url Invalid or Lender Agent offline')) }
    } catch (e) {
      console.log('Error:', e)
    }

    // TODO: implement verify signature
    console.log('end /liquidators/new')
  }))

  router.get('/liquidators/:agentModelId', asyncHandler(async (req, res, next) => {
    const { params } = req

    const agent = await Liquidator.findOne({ _id: params.agentModelId }).exec()
    if (!agent) return next(res.createError(401, 'Agent not found'))

    res.json(agent.json())
  }))

  router.get('/liquidators/ethsigner/:ethSigner', asyncHandler(async (req, res, next) => {
    const { params } = req
    const { ethSigner } = params

    const agent = await Liquidator.findOne({ ethSigner }).exec()
    if (!agent) return next(res.createError(401, 'Agent not found'))

    res.json(agent.json())
  }))

  router.get('/liquidators/principaladdress/:principalAddress', asyncHandler(async (req, res, next) => {
    console.log('start /liquidators/principaladdress/:principalAddress')
    const { params } = req
    const { principalAddress } = params

    const agent = await Liquidator.findOne({ principalAddress }).exec()
    if (!agent) return next(res.createError(401, 'Agent not found'))

    res.json(agent.json())
  }))

  router.get('/liquidators', asyncHandler(async (req, res) => {
    const result = await Liquidator.find().exec()

    res.json(result.map(r => r.json()))
  }))
}

module.exports = defineLiquidatorsRouter
