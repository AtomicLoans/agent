const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const web3 = require('web3')
const { sleep } = require('@liquality/utils')

const { chains } = require('../../common')
const { getWeb3Address } = require('../util/web3Helpers')
const { getTestContract, getTestObjects, getTestObject, fundTokens, getAgentAddress } = require('../loanCommon')
const { numToBytes32 } = require('../../../src/utils/finance')
const { currencies } = require('../../../src/utils/fx')
const fundFixtures = require('../fixtures/fundFixtures')

const hotColdWallet = require('../../../src/abi/hotcoldwallet.json')

const { toWei } = web3.utils

chai.should()

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const server = 'http://localhost:3030/api/loan'
const arbiterServer = 'http://localhost:3032/api/loan'

async function createCustomFund (web3Chain, arbiterChain, amount, principal) {
  const { body: loanMarkets } = await chai.request(server).get('/loanmarketinfo')
  const { body: { principalAddress, proxyEnabled, principalAgentAddress } } = await chai.request(server).get(`/agentinfo/${loanMarkets[0].id}`)

  await chains.ethereumWithNode.client.chain.sendTransaction(principalAgentAddress, toWei('0.2', 'ether'))

  const currentTime = Math.floor(new Date().getTime() / 1000)
  const address = await getWeb3Address(web3Chain)
  const fundParams = fundFixtures.customFundWithFundExpiryIn100Days(currentTime, principal)
  const [token, funds] = await getTestObjects(web3Chain, principal, ['erc20', 'funds'])
  const unit = currencies[principal].unit
  const amountToDeposit = toWei(amount.toString(), unit)
  await fundTokens(address, amountToDeposit, principal)

  if (proxyEnabled) {
    const funds = await getTestObject(web3Chain, 'funds', principal)
    console.log('funds', funds)
    console.log('funds.methods', funds.methods)
    console.log('funds.methods.createCustom', funds.methods.createCustom)
    console.log('fundParams', fundParams)

    const arbiterAddress = await getAgentAddress(arbiterServer)
    const agentAddress = await getAgentAddress(server)

    const collateral = 'BTC'

    const { maxLoanDuration, fundExpiry, compoundEnabled, amount } = fundParams

    const formattedFundParams = [
      maxLoanDuration,
      fundExpiry,
      arbiterAddress,
      compoundEnabled,
      amount
    ]

    const createFundTxData = funds.methods.create(...formattedFundParams).encodeABI()

    const walletProxy = new web3Chain.client.eth.Contract(hotColdWallet.abi, { from: address })

    const walletProxyInstance = await walletProxy.deploy({
      data: hotColdWallet.bytecode,
      arguments: [getTestContract('funds', principal), getTestContract('loans', principal), getTestContract('sales', principal), agentAddress, createFundTxData]
    }).send({ gas: 3000000 })

    const { _address: proxyAddress } = walletProxyInstance

    const { status: requestsStatus } = await chai.request(server).post('/funds/new').send({ principal, collateral, proxyAddress })
    console.log('requestsStatus', requestsStatus)

    const fundId = await funds.methods.fundIndex().call()

    await token.methods.approve(getTestContract('funds', principal), amountToDeposit).send({ gas: 100000 })
    await funds.methods.deposit(numToBytes32(fundId), amountToDeposit).send({ gas: 800000 })

    return fundId
  } else {
    const { body } = await chai.request(server).post('/funds/new').send(fundParams)
    const { id: fundModelId } = body

    const fundId = await checkFundCreated(fundModelId)

    if (!fundId) {
      return
    }

    await token.methods.approve(getTestContract('funds', principal), amountToDeposit).send({ gas: 100000 })
    await funds.methods.deposit(numToBytes32(fundId), amountToDeposit).send({ gas: 100000 })

    return fundId
  }
}

async function depositToFund (web3Chain, amount, principal) {
  const address = await getWeb3Address(web3Chain)
  const [token, funds] = await getTestObjects(web3Chain, principal, ['erc20', 'funds'])
  const unit = currencies[principal].unit
  const amountToDeposit = toWei(amount.toString(), unit)
  await fundTokens(address, amountToDeposit, principal)

  const { body } = await chai.request(server).get(`/funds/ticker/${principal}`)
  const { fundId } = body

  await token.methods.approve(getTestContract('funds', principal), amountToDeposit).send({ gas: 100000 })
  await funds.methods.deposit(numToBytes32(fundId), amountToDeposit).send({ gas: 100000 })

  return fundId
}

async function checkFundCreated (fundModelId, canBeFailed = false) {
  let created = false
  let fundId
  while (!created) {
    await sleep(1000)
    const { body } = await chai.request(server).get(`/funds/${fundModelId}`)
    const { status } = body
    console.log(status)
    if (status === 'CREATED') {
      created = true
      fundId = body.fundId
    } else if (canBeFailed && status === 'FAILED') {
      created = true
    }
  }

  return fundId
}

module.exports = {
  createCustomFund,
  depositToFund,
  checkFundCreated
}
