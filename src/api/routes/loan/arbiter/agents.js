const asyncHandler = require('express-async-handler')
const requestIp = require('request-ip')

const { verifySignature } = require('../../../../utils/signatures')

const Agent = require('../../../../models/Agent')

function defineAgentsRouter (router) {
  router.post('/agents/new', asyncHandler(async (req, res, next) => {
    console.log('start /agents/new')
    const { body } = req
    const { ethSigner, principalAddress, collateralPublicKey } = body
    const endpoint = requestIp.getClientIp(req)

    // TODO: implement verify signature

    const params = { ethSigner, principalAddress, collateralPublicKey, endpoint }

    const agent = Agent.fromAgentParams(params)

    await agent.save()

    console.log('end /agents/new')

    res.json(agent.json())
  }))

  router.get('/agents/:agentModelId', asyncHandler(async (req, res, next) => {
    const { params } = req

    const agent = await Agent.findOne({ _id: params.agentModelId }).exec()
    if (!agent) return next(res.createError(401, 'Agent not found'))

    res.json(agent.json())
  }))
}

module.exports = defineAgentsRouter
