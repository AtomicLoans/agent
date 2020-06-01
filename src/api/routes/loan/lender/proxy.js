const asyncHandler = require('express-async-handler')
const { getObject } = require('../../../../utils/contracts')
const web3 = require('../../../../utils/web3')

const LoanMarket = require('../../../../models/LoanMarket')
const HotColdWalletProxy = require('../../../../models/HotColdWalletProxy')

function defineProxyRouter (router) {
  router.post('/proxys/new', asyncHandler(async (req, res, next) => {
    console.log('start /proxys/new')

    // pass in principal, collateral, cold wallet address and contract address
    const { body } = req
    const { principal, collateral, coldWalletAddress, contractAddress } = body

    const loanMarket = await LoanMarket.findOne({ principal, collateral }).exec()
    const { principalAgentAddress } = await loanMarket.getAgentAddresses()

    const proxyParams = { principal, collateral, hotWalletAddress: principalAgentAddress, coldWalletAddress, contractAddress }
    const proxyModel = HotColdWalletProxy.fromWalletAddresses(proxyParams)

    const contractCode = await web3().eth.getCode(contractAddress)
    if (contractCode === '0x') return next(res.createError(401, 'Contract not instantiated at address'))

    const funds = getObject('funds', principal)
    const loans = getObject('loans', principal)
    const sales = getObject('sales', principal)
    const proxy = getObject('hotcoldwallet', contractAddress)

    const { _address: fundsAddress } = funds
    const { _address: loansAddress } = loans
    const { _address: salesAddress } = sales

    // Verify that proxy exists on ethereum blockchain
    const proxyColdAddress = await proxy.methods.cold().call()
    const proxyHotAddress = await proxy.methods.hot().call()
    const proxyFundsAddress = await proxy.methods.funds().call()
    const proxyLoansAddress = await proxy.methods.loans().call()
    const proxySalesAddress = await proxy.methods.sales().call()

    const fundsMatch = fundsAddress === proxyFundsAddress
    const loansMatch = loansAddress === proxyLoansAddress
    const salesMatch = salesAddress === proxySalesAddress
    const agentAddressesMatch = principalAgentAddress === proxyHotAddress
    const coldAddressesMatch = coldWalletAddress === proxyColdAddress

    if (!fundsMatch || !loansMatch || !salesMatch || !coldAddressesMatch || !agentAddressesMatch) return next(res.createError(401, 'Addresses don\'t match'))

    await proxyModel.save()

    console.log('end /proxys/new')

    res.json(proxyModel.json())
  }))

  router.get('/proxys', asyncHandler(async (req, res) => {
    const result = await HotColdWalletProxy.find().exec()

    res.json(result.map(r => r.json()))
  }))

  router.get('/proxys/:proxyModelId', asyncHandler(async (req, res, next) => {
    const { params } = req

    const proxy = await HotColdWalletProxy.findOne({ _id: params.proxyModelId }).exec()
    if (!proxy) return next(res.createError(401, 'Proxy not found'))

    res.json(proxy.json())
  }))

  router.get('/proxys/ticker/:principal/:collateral', asyncHandler(async (req, res, next) => {
    const { params } = req
    const { principal, collateral } = params

    const proxy = await HotColdWalletProxy.findOne({ principal, collateral }).exec()
    if (!proxy) return next(res.createError(401, 'Proxy not found'))

    res.json(proxy.json())
  }))
}

module.exports = defineProxyRouter
