const asyncHandler = require('express-async-handler')
const requestIp = require('request-ip')

const { verifySignature } = require('../../../../utils/signatures')

const Agent = require('../../../../models/Agent')

function defineAgentsRouter (router) {
  router.post('/agents/new', asyncHandler(async (req, res, next) => {
    console.log('start /agents/new')
    const { body } = req
    const { ethSigner, principalAddress, collateralPublicKey, url, testUrl } = body
    const endpoint = requestIp.getClientIp(req)

    const agentExists = await Agent.findOne({ ethSigner, principalAddress, collateralPublicKey }).exec()
    if (!agentExists) {
      const params = { ethSigner, principalAddress, collateralPublicKey, url, testUrl, endpoint }
      const agent = Agent.fromAgentParams(params)
      await agent.save()
      res.json(agent.json())
    } else {
      res.json(agentExists.json())
    }
    // TODO: implement verify signature
    console.log('end /agents/new')
  }))

  router.get('/agents/:agentModelId', asyncHandler(async (req, res, next) => {
    const { params } = req

    const agent = await Agent.findOne({ _id: params.agentModelId }).exec()
    if (!agent) return next(res.createError(401, 'Agent not found'))

    res.json(agent.json())
  }))

  router.get('/agents', asyncHandler(async (req, res) => {
    const result = await Agent.find().exec()

    res.json(result.map(r => r.json()))
  }))
}

module.exports = defineAgentsRouter
