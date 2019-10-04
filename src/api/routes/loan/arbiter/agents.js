const axios = require('axios')
const asyncHandler = require('express-async-handler')
const requestIp = require('request-ip')

const { verifySignature } = require('../../../../utils/signatures')

const Agent = require('../../../../models/Agent')

function defineAgentsRouter (router) {
  router.post('/agents/new', asyncHandler(async (req, res, next) => {
    console.log('start /agents/new')
    const { body } = req
    const { ethSigner, principalAddress, collateralPublicKey, url } = body
    const endpoint = requestIp.getClientIp(req)

    // TODO verify signature when creating new agent

    const { status, data: loanMarkets } = await axios.get(`${url}/loanmarketinfo`)
    console.log('status', status)
    console.log('loanMarkets', loanMarkets)

    if (status === 200) {
      const { data: agent } = await axios.get(`${url}/agentinfo/${loanMarkets[0].id}`)
      console.log('agent', agent)
      const { principalAddress: principalAddressResponse, collateralPublicKey: collateralPublicKeyResponse } = agent
      if (principalAddress === principalAddressResponse && collateralPublicKey === collateralPublicKeyResponse) {
        const agentExists = await Agent.findOne({ url }).exec()
        if (!agentExists) {
          const params = { ethSigner, principalAddress, collateralPublicKey, url, endpoint }
          const agent = Agent.fromAgentParams(params)
          await agent.save()
          res.json(agent.json())
        } else {
          if (principalAddress !== agentExists.principalAddress || ethSigner !== agentExists.ethSigner) {
            agentExists.principalAddress = principalAddress
            agentExists.collateralPublicKey = collateralPublicKey
            agentExists.ethSigner = ethSigner
            await agentExists.save()
          }

          res.json(agentExists.json())
        }
      } else { return next(res.createError(401, 'Principal Address doesn\'t match')) }
    } else { return next(res.createError(401, 'Url Invalid or Lender Agent offline')) }

    // TODO: implement verify signature
    console.log('end /agents/new')
  }))

  router.get('/agents/:agentModelId', asyncHandler(async (req, res, next) => {
    const { params } = req

    const agent = await Agent.findOne({ _id: params.agentModelId }).exec()
    if (!agent) return next(res.createError(401, 'Agent not found'))

    res.json(agent.json())
  }))

  router.get('/agents/ethsigner/:ethSigner', asyncHandler(async (req, res, next) => {
    const { params } = req
    const { ethSigner } = params

    const agent = await Agent.findOne({ ethSigner }).exec()
    if (!agent) return next(res.createError(401, 'Agent not found'))

    res.json(agent.json())
  }))

  router.get('/agents', asyncHandler(async (req, res) => {
    const result = await Agent.find().exec()

    res.json(result.map(r => r.json()))
  }))
}

module.exports = defineAgentsRouter
