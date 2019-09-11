/* eslint-env mocha */
require('dotenv').config()
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const BN = require('bignumber.js')
const { ensure0x, checksumEncode } = require('@liquality/ethereum-utils')
const { sha256 } = require('@liquality/crypto')
const toSecs = require('@mblackmblack/to-seconds')
const bitcoin = require('bitcoinjs-lib')
const { chains, connectMetaMask, importBitcoinAddresses, fundUnusedBitcoinAddress } = require('../common')
const web3 = require('../../src/utils/web3')
const { toWei, fromWei, numberToHex } = web3.utils
const { testLoadObject } = require('./util/contracts')
const { loadObject } = require('../../src/utils/contracts')
const { currencies } = require('../../src/utils/fx')
const { numToBytes32, rateToSec } = require('../../src/utils/finance')

chai.should()
const expect = chai.expect

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const server = 'http://localhost:3030/api/loan'

describe('loanmarketinfo', () => {
  before(async function () {
    await importBitcoinAddresses(chains.bitcoinWithJs)
  })

  describe('/GET loanmarketinfo', () => {
    it('should GET all the loan markets', (done) => {
      chai.request(server)
        .get('/loanmarketinfo')
        .end((_, res) => {
          res.should.have.status(200)
          res.body.should.be.a('array')
          res.body.length.should.be.eql(2)
          done()
        })
    })
  })

  describe('/GET agentinfo/:marketId', () => {
    it('should GET current agent addresses from marketId', async () => {
      const { body: loanMarkets } = await chai.request(server).get('/loanmarketinfo')
      const { body: addresses } = await chai.request(server).get(`/agentinfo/${loanMarkets[0].id}`)
      const { principalAddress } = addresses

      expect(principalAddress.length / 2).to.equal(21)
    })
  })

  describe('Withdraw excess funds', () => {
    connectMetaMask()

    it('should return eth to metamask user if ETH_SIGNER', async () => {
      const timestamp = Math.floor(new Date().getTime() / 1000)
      const amount = 1
      const currency = 'ETH'
      const address = checksumEncode((await chains.ethereumWithMetaMask.client.wallet.getAddresses())[0].address)
      const message = `Withdraw ${amount} ${currency} to ${address} at ${timestamp}`

      await chains.ethereumWithNode.client.chain.sendTransaction(address, toWei(amount.toString(), 'ether'))

      const signature = await chains.ethereumWithMetaMask.client.wallet.signMessage(message)
      const balanceBefore = await chains.ethereumWithNode.client.chain.getBalance(address)

      await chai.request(server).post('/withdraw').send({ currency, timestamp, signature, amount, message })

      const balanceAfter = await chains.ethereumWithNode.client.chain.getBalance(address)

      expect(BN(balanceAfter).toFixed()).to.equal(BN(balanceBefore).plus(BN(toWei(amount.toString(), 'ether'))).toFixed())
    })
  })

  describe('Create Custom Loan Fund', () => {
    connectMetaMask()
    before(async function () {
      await fundArbiter()
      await generateSecretHashesArbiter('DAI')
    })

    it('should create a new loan fund and deposit funds into it', async () => {
      const currentTime = Math.floor(new Date().getTime() / 1000)

      const collateral = 'BTC'
      const principal = 'DAI'
      const custom = true
      const arbiter = (await chains.web3WithArbiter.client.currentProvider.getAddresses())[0]

      console.log('create custom loan fund arbiter', arbiter)

      const compoundEnabled = false
      const amount = 0
      const maxLoanDuration = 0
      const maxFundDuration = currentTime + toSecs({ days: 100 })
      const liquidationRatio = 150 // 150% collateralization ratio
      const interest = 16.5 // 16.5% APR
      const penalty = 3 // 3% APR
      const fee = 0.75 // 0.75% APR

      const unit = currencies[principal].unit
      const amountToDeposit = toWei('200', unit)

      const { body: loanMarkets } = await chai.request(server).get('/loanmarketinfo')
      const { body: addresses } = await chai.request(server).get(`/agentinfo/${loanMarkets[0].id}`)
      const { principalAddress } = addresses

      await chains.ethereumWithNode.client.chain.sendTransaction(principalAddress, toWei('1', 'ether'))

      const { body } = await chai.request(server).post('/funds/new').send({
        collateral, principal, custom, arbiter, compoundEnabled, amount, maxLoanDuration, maxFundDuration, liquidationRatio, interest, penalty, fee
      })
      const { fundId } = body

      const address = (await chains.web3WithMetaMask.client.eth.getAccounts())[0]

      const { address: ethereumWithNodeAddress } = await chains.ethereumWithNode.client.wallet.getUnusedAddress()

      console.log('erc20', process.env[`${principal}_ADDRESS`], chains.web3WithNode, ensure0x(ethereumWithNodeAddress))

      const token = await testLoadObject('erc20', process.env[`${principal}_ADDRESS`], chains.web3WithNode, ensure0x(ethereumWithNodeAddress))
      await token.methods.transfer(address, amountToDeposit).send()

      const testToken = await testLoadObject('erc20', process.env[`${principal}_ADDRESS`], chains.web3WithMetaMask, address)
      await testToken.methods.approve(process.env[`${principal}_LOAN_FUNDS_ADDRESS`], amountToDeposit).send()

      console.log(`Depositing ${principal} to Loan Fund`)

      const testFunds = await testLoadObject('funds', process.env[`${principal}_LOAN_FUNDS_ADDRESS`], chains.web3WithMetaMask, address)
      await testFunds.methods.deposit(numToBytes32(fundId), amountToDeposit).send()

      const {
        lender, maxLoanDur, maxFundDur, interest: actualInterest, penalty: actualPenalty, fee: actualFee, liquidationRatio: actualLiquidationRatio, balance
      } = await testFunds.methods.funds(numToBytes32(fundId)).call()

      const fundStruct = await testFunds.methods.funds(numToBytes32(fundId)).call()
      console.log(`Deposited Funds to Loan Fund: ${fundId}`, fundStruct)

      console.log('Loan Fund', fundId, 'Balance:', fromWei(balance, unit), principal)

      expect(fromWei(balance, 'wei')).to.equal(amountToDeposit)

      expect(lender).to.equal(checksumEncode(principalAddress))
      expect(maxLoanDur).to.equal(BN(2).pow(256).minus(1).toFixed())
      expect(maxFundDur).to.equal(maxFundDuration.toString())
      expect(actualLiquidationRatio).to.equal(toWei((liquidationRatio / 100).toString(), 'gether'))
      expect(actualInterest).to.equal(toWei(rateToSec(interest.toString()), 'gether'))
      expect(actualPenalty).to.equal(toWei(rateToSec(penalty.toString()), 'gether'))
      expect(actualFee).to.equal(toWei(rateToSec(fee.toString()), 'gether'))
    })
  })

  describe('/POST requests', () => {
    connectMetaMask()
    before(async function () {
      await importBitcoinAddresses(chains.bitcoinWithJs)
      await fundUnusedBitcoinAddress(chains.bitcoinWithJs)
      await fundArbiter()
      await generateSecretHashesArbiter('DAI')
    })

    it('should POST loanMarket details and return loanRequest details', async () => {
      const principal = 'DAI'
      const collateral = 'BTC'
      const principalAmount = 25
      const loanDuration = toSecs({ days: 2 })

      const { status: requestsStatus, body: requestsBody } = await chai.request(server).post('/requests').send({ principal, collateral, principalAmount, loanDuration })

      expect(requestsStatus).to.equal(200)
      requestsBody.should.be.a('object')

      const { id: requestId, lenderPrincipalAddress, lenderCollateralPublicKey, minimumCollateralAmount, requestCreatedAt } = requestsBody

      const { address: borrowerPrincipalAddress } = await chains.ethereumWithMetaMask.client.wallet.getUnusedAddress()

      const { address, publicKey: borrowerCollateralPublicKey } = await chains.bitcoinWithJs.client.wallet.getUnusedAddress()
      const collateralValue = Math.floor(BN(minimumCollateralAmount).times(currencies[collateral].multiplier).times(1.2).toNumber())

      const currentTime = Date.now()

      const data = Buffer.from(`${lenderCollateralPublicKey} ${principalAmount} ${principal} ${currentTime}`, 'utf8')
      const dataScript = bitcoin.payments.embed({ data: [data] })

      const proofOfFundsTxHex = await chains.bitcoinWithJs.client.chain.buildBatchTransaction([{ to: address, value: collateralValue }, { to: dataScript.output, value: 0 }])

      const secretData = [
        toWei(principalAmount.toString(), currencies[principal].unit), // Principal Value
        principal, // Principal
        collateralValue, // Collateral Value
        collateral, // Collateral
        borrowerPrincipalAddress, // Borrower Principal Address
        lenderPrincipalAddress, // Lender Principal Address
        borrowerCollateralPublicKey, // Borrower Collateral PubKey
        lenderCollateralPublicKey, // Lender Collateral PubKey
        requestCreatedAt // Fund Id as number
      ]

      const secretMsg = secretData.join('')
      const secrets = await chains.bitcoinWithJs.client.loan.secrets.generateSecrets(secretMsg, 4)
      const secretHashes = secrets.map(secret => sha256(secret))

      const { status: requestsIdStatus, body: requestsIdBody } = await chai.request(server).post(`/requests/${requestId}`).send({
        proofOfFundsTxHex, borrowerSecretHashes: secretHashes, borrowerPrincipalAddress, borrowerCollateralPublicKey: borrowerCollateralPublicKey.toString('hex')
      })
      const {
        collateralAmount: collateralAmountActual, borrowerPrincipalAddress: borrowerPrincipalAddressActual, borrowerCollateralPublicKey: borrowerCollateralPublicKeyActual
      } = requestsIdBody
      const { loanId } = requestsIdBody

      expect(requestsIdStatus).to.equal(200)
      requestsIdBody.should.be.a('object')
      expect(BN(collateralAmountActual).times(currencies[collateral].multiplier).toNumber()).to.equal(collateralValue)
      expect(borrowerPrincipalAddressActual).to.equal(borrowerPrincipalAddress)
      expect(borrowerCollateralPublicKeyActual).to.equal(borrowerCollateralPublicKey.toString('hex'))

      console.log('requestsIdBody', requestsIdBody)
    })
  })

  describe('test', () => {
    connectMetaMask()

    it('should', async () => {
      const loanId = 1
      const principal = 'DAI'

      const address = (await chains.web3WithMetaMask.client.eth.getAccounts())[0]
      const testLoans = await testLoadObject('loans', process.env[`${principal}_LOAN_LOANS_ADDRESS`], chains.web3WithMetaMask, address)

      const pubKeys = await testLoans.methods.pubKeys(numToBytes32(loanId)).call()
      console.log('pubKeys', pubKeys)

      const secretHashes = await testLoans.methods.secretHashes(numToBytes32(loanId)).call()
      console.log('secretHashes', secretHashes)

      const approveExpiration = await testLoans.methods.approveExpiration(numToBytes32(loanId)).call()
      console.log('approveExpiration', approveExpiration)

      const liquidationExpiration = await testLoans.methods.liquidationExpiration(numToBytes32(loanId)).call()
      console.log('liquidationExpiration', liquidationExpiration)

      const seizureExpiration = await testLoans.methods.seizureExpiration(numToBytes32(loanId)).call()
      console.log('seizureExpiration', seizureExpiration)
    })
  })
})

async function fundArbiter () {
  const unusedAddress = (await chains.web3WithArbiter.client.currentProvider.getAddresses())[0]
  console.log('arbiterUnusedAddress', unusedAddress)
  await chains.ethereumWithNode.client.chain.sendTransaction(unusedAddress, toWei('1', 'ether'))
}

async function generateSecretHashesArbiter (principal) {
  const address = (await chains.web3WithArbiter.client.currentProvider.getAddresses())[0]
  const { publicKey } = await chains.bitcoinArbiter.client.wallet.getUnusedAddress()

  const secrets = await chains.bitcoinWithJs.client.loan.secrets.generateSecrets('test', 40)
  const secretHashes = secrets.map(secret => ensure0x(sha256(secret)))

  const testFunds = await testLoadObject('funds', process.env[`${principal}_LOAN_FUNDS_ADDRESS`], chains.web3WithArbiter, address)
  await testFunds.methods.generate(secretHashes).send({ from: address, gas: 6000000 })
  await testFunds.methods.setPubKey(ensure0x(publicKey.toString('hex'))).send({ from: address, gas: 6000000 })
}
