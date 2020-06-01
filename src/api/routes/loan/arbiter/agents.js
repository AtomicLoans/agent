const axios = require('axios')
const asyncHandler = require('express-async-handler')
const requestIp = require('request-ip')

const { getCurrentTime } = require('../../../../utils/time')
const web3 = require('../../../../utils/web3')
const { fromWei } = web3().utils

const Agent = require('../../../../models/Agent')
const AgentFund = require('../../../../models/AgentFund')
const { verifyTimestampedSignatureUsingExpected } = require('../../../../utils/signatures')

function defineAgentsRouter (router) {
  router.post('/agents/new', asyncHandler(async (req, res, next) => {
    console.log('start /agents/new')
    const { body } = req
    const { ethSigner, principalAddress, collateralPublicKey, url, signature, timestamp, proxyEnabled, principalAgentAddress } = body

    try {
      if (proxyEnabled) {
        verifyTimestampedSignatureUsingExpected(signature, `Register new agent (${principalAgentAddress} ${collateralPublicKey} ${ethSigner} ${url}) ${timestamp}`, timestamp, principalAgentAddress)
      } else {
        verifyTimestampedSignatureUsingExpected(signature, `Register new agent (${principalAddress} ${collateralPublicKey} ${ethSigner} ${url}) ${timestamp}`, timestamp, principalAddress)
      }
    } catch (e) {
      return next(res.createError(401, e.message))
    }

    const endpoint = requestIp.getClientIp(req)

    try {
      const { status, data: loanMarkets } = await axios.get(`${url}/loanmarketinfo`)

      if (status === 200) {
        for (const loanMarket of loanMarkets) {
          const { principal, collateral } = loanMarket

          const { data: agent } = await axios.get(`${url}/agentinfo/${loanMarket.id}`)
          const { data: { version } } = await axios.get(`${url}/version`)

          const { principalAddress: loanMarketPrincipalAddress, proxyEnabled: agentProxyEnabled } = agent
          if (agentProxyEnabled) {
            // if proxy is enabled check if principal address is set
            // find agent by url, ethSigner and principalAgentAddress
            if (loanMarketPrincipalAddress) {
              const agentWithUrlExists = await Agent.findOne({ url }).exec()
              const agentWithEthSignerExists = await Agent.findOne({ ethSigner }).exec()
              const agentWithPrincipalAgentAddressExists = await Agent.findOne({ principalAgentAddress }).exec()

              if (!agentWithUrlExists && !agentWithEthSignerExists && !agentWithPrincipalAgentAddressExists) {
                // define principal addresses
                const ethBalance = await web3().eth.getBalance(principalAgentAddress)
                const params = { ethSigner, principalAddress: loanMarketPrincipalAddress, principalAgentAddress, collateralPublicKey, url, endpoint, ethBalance: fromWei(ethBalance.toString(), 'ether'), version, proxyEnabled: agentProxyEnabled }
                const agent = Agent.fromAgentParams(params)

                // update agent principalAddresses
                agent.principalAddresses = [{ principal, collateral, principalAddress: loanMarketPrincipalAddress }]
                await agent.save()
              } else if (!agentWithUrlExists && !agentWithEthSignerExists && agentWithPrincipalAgentAddressExists) {
                agentWithPrincipalAgentAddressExists.url = url
                agentWithPrincipalAgentAddressExists.ethSigner = ethSigner
                let found = false
                for (let i = 0; i < agentWithPrincipalAgentAddressExists.principalAddresses.length; i++) {
                  if (agentWithPrincipalAgentAddressExists.principalAddresses[i].principal === principal) {
                    found = true
                  }
                }
                if (!found) {
                  const currentPrincipalAddresses = agentWithPrincipalAgentAddressExists.principalAddresses
                  currentPrincipalAddresses.push({ principal, collateral, principalAddress: loanMarketPrincipalAddress })
                  agentWithPrincipalAgentAddressExists.principalAddress = currentPrincipalAddresses
                }
                await agentWithPrincipalAgentAddressExists.save()
              } else if (!agentWithUrlExists && agentWithEthSignerExists && !agentWithPrincipalAgentAddressExists) {
                agentWithEthSignerExists.url = url
                agentWithEthSignerExists.principalAddress = principalAddress
                agentWithEthSignerExists.principalAgentAddress = principalAgentAddress
                agentWithEthSignerExists.collateralPublicKey = collateralPublicKey
                await agentWithEthSignerExists.save()
              } else if (agentWithUrlExists && !agentWithEthSignerExists && !agentWithPrincipalAgentAddressExists) {
                agentWithUrlExists.ethSigner = ethSigner
                agentWithUrlExists.principalAddress = principalAddress
                agentWithUrlExists.principalAgentAddress = principalAgentAddress
                agentWithUrlExists.collateralPublicKey = collateralPublicKey
                await agentWithUrlExists.save()
              } else {
                const agentModel = await Agent.findOne({ url }).exec()

                let principalAddressFound = false
                let principalAddresses = agentModel.principalAddresses
                for (let i = 0; i < principalAddresses.length; i++) {
                  if (principalAddresses[i].principal === principal) {
                    principalAddressFound = true
                  }
                }

                if (!principalAddressFound) {
                  principalAddresses = principalAddresses.push({ principal, collateral, principalAddress: loanMarketPrincipalAddress })
                  if (agentModel.principalAddress === undefined || agentModel.principalAddress === 'undefined') { // Set principalAddress to proxy address for backwards compatibility
                    agentModel.principalAddress = loanMarketPrincipalAddress
                  }
                }

                await agentModel.save()
              }
            } else {
              const agentWithUrlExists = await Agent.findOne({ url }).exec()
              const agentWithEthSignerExists = await Agent.findOne({ ethSigner }).exec()
              const agentWithPrincipalAgentAddressExists = await Agent.findOne({ principalAgentAddress }).exec()

              if (!agentWithUrlExists && !agentWithEthSignerExists && !agentWithPrincipalAgentAddressExists) {
                const ethBalance = await web3().eth.getBalance(principalAgentAddress)
                const params = { ethSigner, principalAddress: undefined, principalAgentAddress, collateralPublicKey, url, endpoint, ethBalance: fromWei(ethBalance.toString(), 'ether'), version, proxyEnabled: agentProxyEnabled }
                const agent = Agent.fromAgentParams(params)
                await agent.save()
              } else if (!agentWithUrlExists && !agentWithEthSignerExists && agentWithPrincipalAgentAddressExists) {
                agentWithPrincipalAgentAddressExists.url = url
                agentWithPrincipalAgentAddressExists.ethSigner = ethSigner
                await agentWithPrincipalAgentAddressExists.save()
              } else if (!agentWithUrlExists && agentWithEthSignerExists && !agentWithPrincipalAgentAddressExists) {
                agentWithEthSignerExists.url = url
                agentWithEthSignerExists.principalAgentAddress = principalAgentAddress
                agentWithEthSignerExists.collateralPublicKey = collateralPublicKey
                await agentWithEthSignerExists.save()
              } else if (agentWithUrlExists && !agentWithEthSignerExists && !agentWithPrincipalAgentAddressExists) {
                agentWithUrlExists.ethSigner = ethSigner
                agentWithUrlExists.principalAddress = principalAddress
                agentWithUrlExists.principalAgentAddress = principalAgentAddress
                agentWithUrlExists.collateralPublicKey = collateralPublicKey
                await agentWithUrlExists.save()
              }
            }
          } else {
            const agentWithUrlExists = await Agent.findOne({ url }).exec()
            const agentWithEthSignerExists = await Agent.findOne({ ethSigner }).exec()
            const agentWithPrincipalAddressExists = await Agent.findOne({ principalAddress }).exec()

            if (!agentWithUrlExists && !agentWithEthSignerExists && !agentWithPrincipalAddressExists) {
              const ethBalance = await web3().eth.getBalance(principalAddress)
              const params = { ethSigner, principalAddress, principalAgentAddress: principalAddress, collateralPublicKey, url, endpoint, ethBalance: fromWei(ethBalance.toString(), 'ether'), version, proxyEnabled: false }
              const agent = Agent.fromAgentParams(params)
              await agent.save()
            } else if (!agentWithUrlExists && !agentWithEthSignerExists && agentWithPrincipalAddressExists) {
              agentWithPrincipalAddressExists.url = url
              agentWithPrincipalAddressExists.ethSigner = ethSigner
              await agentWithPrincipalAddressExists.save()
            } else if (!agentWithUrlExists && agentWithEthSignerExists && !agentWithPrincipalAddressExists) {
              agentWithEthSignerExists.url = url
              agentWithEthSignerExists.principalAddress = principalAddress
              agentWithEthSignerExists.principalAgentAddress = principalAgentAddress
              agentWithEthSignerExists.collateralPublicKey = collateralPublicKey
              await agentWithEthSignerExists.save()
            } else if (agentWithUrlExists && !agentWithEthSignerExists && !agentWithPrincipalAddressExists) {
              agentWithUrlExists.ethSigner = ethSigner
              agentWithUrlExists.principalAddress = principalAddress
              agentWithUrlExists.principalAgentAddress = principalAgentAddress
              agentWithUrlExists.collateralPublicKey = collateralPublicKey
              await agentWithUrlExists.save()
            }
          }
        }

        const updatedAgent = await Agent.findOne({ url }).exec()
        res.json(updatedAgent.json())
      } else { return next(res.createError(401, 'Url Invalid or Lender Agent offline')) }
    } catch (e) {
      console.log('Error:', e)
      return next(res.createError(401, e.message))
    }

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

  router.get('/agents/matchfunds/:principal/:collateral', asyncHandler(async (req, res, next) => {
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

    const agentFundQuery = { principal, collateral, status: { $ne: 'INACTIVE' }, ethBalance: { $gte: 0.02 } }
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
