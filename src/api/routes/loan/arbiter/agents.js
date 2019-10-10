const axios = require('axios')
const asyncHandler = require('express-async-handler')
const requestIp = require('request-ip')

const { verifySignature } = require('../../../../utils/signatures')
const { getCurrentTime } = require('../../../../utils/time')
const web3 = require('../../../../utils/web3')
const { fromWei } = web3().utils

const Agent = require('../../../../models/Agent')
const AgentFund = require('../../../../models/AgentFund')

function defineAgentsRouter (router) {
  router.post('/agents/new', asyncHandler(async (req, res, next) => {
    console.log('start /agents/new')
    const { body } = req
    const { ethSigner, principalAddress, collateralPublicKey, url } = body
    const endpoint = requestIp.getClientIp(req)

    // TODO verify signature when creating new agent

    try {
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
            const ethBalance = await web3().eth.getBalance(principalAddress)
            const params = { ethSigner, principalAddress, collateralPublicKey, url, endpoint, ethBalance: fromWei(ethBalance.toString(), 'ether') }
            const agent = Agent.fromAgentParams(params)
            await agent.save()
            res.json(agent.json())
          } else {
            if (principalAddress !== agentExists.principalAddress || ethSigner !== agentExists.ethSigner) {
              const agentFunds = await AgentFund.find({ principalAddress: agentExists.principalAddress }).exec()
              for (let i = 0; i < agentFunds.length; i++) {
                const agentFund = agentFunds[i]
                await AgentFund.deleteOne({ _id: agentFund.id })
              }

              agentExists.principalAddress = principalAddress
              agentExists.collateralPublicKey = collateralPublicKey
              agentExists.ethSigner = ethSigner
              await agentExists.save()
            }

            res.json(agentExists.json())
          }
        } else { return next(res.createError(401, 'Principal Address doesn\'t match')) }
      } else { return next(res.createError(401, 'Url Invalid or Lender Agent offline')) }
    } catch(e) {
      console.log('Error:', e)
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

  router.get('/agents/ethsigner/:ethSigner', asyncHandler(async (req, res, next) => {
    const { params } = req
    const { ethSigner } = params

    const agent = await Agent.findOne({ ethSigner }).exec()
    if (!agent) return next(res.createError(401, 'Agent not found'))

    res.json(agent.json())
  }))

  router.get('/agents/principaladdress/:principalAddress', asyncHandler(async (req, res, next) => {
    console.log('start /agents/principaladdress/:principalAddress')
    const { params } = req
    const { principalAddress } = params

    const agent = await Agent.findOne({ principalAddress }).exec()
    if (!agent) return next(res.createError(401, 'Agent not found'))

    res.json(agent.json())
  }))

  router.get('/agents', asyncHandler(async (req, res) => {
    const result = await Agent.find().exec()

    res.json(result.map(r => r.json()))
  }))

  router.get('/agents/matchfunds/:principal/:collateral', asyncHandler(async (req, res) => {
    const { params, query } = req
    const { principal, collateral } = params
    let { amount, maxAmount, length, maxLength } = query

    if (maxAmount && maxLength) return next(res.createError(401, 'Can\'t query both maxAmount and maxLength'))
    if (amount && maxAmount) return next(res.createError(401, 'Can\'t query both amount and maxAmount'))
    if (length && maxLength) return next(res.createError(401, 'Can\'t query both length and maxLength'))

    amount = parseInt(amount)
    length = parseInt(length)

    const currentTime = parseInt(await getCurrentTime())

    const twelveHoursInSeconds = 21600

    const agentFundQuery = { principal, collateral, status: { $ne: 'INACTIVE' }, ethBalance: { $gte: 0.015 } }
    const agentFundSort = {}

    if (amount && length) {
      agentFundQuery.marketLiquidity = { $gte: amount }
      agentFundQuery.maxLoanLengthTimestamp = { $gte: (currentTime + length) }
      agentFundSort.utilizationRatio = 'ascending'
    } else if (amount && !maxLength) {
      agentFundQuery.marketLiquidity = { $gte: amount }
      agentFundQuery.maxLoanLengthTimestamp = { $gte: currentTime + twelveHoursInSeconds }
      agentFundSort.utilizationRatio = 'ascending'
    } else if (!length && maxAmount) {
      agentFundQuery.marketLiquidity = { $gt: 0 }
      agentFundQuery.maxLoanLengthTimestamp = { $gte: currentTime + twelveHoursInSeconds }
      agentFundSort.marketLiquidity = 'descending'
    } else if (!amount && maxLength) {
      agentFundQuery.marketLiquidity = { $gt: 0 }
      agentFundQuery.maxLoanLengthTimestamp = { $gte: currentTime + twelveHoursInSeconds }
      agentFundSort.maxLoanLengthTimestamp = 'descending'
    } else if (amount && maxLength) {
      agentFundQuery.marketLiquidity = { $gte: amount }
      agentFundQuery.maxLoanLengthTimestamp = { $gte: currentTime + twelveHoursInSeconds }
      agentFundSort.maxLoanLengthTimestamp = 'descending'
    } else if (length && maxAmount) {
      agentFundQuery.marketLiquidity = { $gt: 0 }
      agentFundQuery.maxLoanLengthTimestamp = { $gte: (currentTime + length) }
      agentFundSort.marketLiquidity = 'descending'
    } else {
      agentFundQuery.marketLiquidity = { $gt: 0 }
      agentFundQuery.maxLoanLengthTimestamp = { $gte: currentTime + twelveHoursInSeconds }
      agentFundSort.utilizationRatio = 'ascending'
    }

    const result = await AgentFund.find(agentFundQuery).sort(agentFundSort).exec()

    res.json(result.map(r => r.json()))
  }))
}

module.exports = defineAgentsRouter
