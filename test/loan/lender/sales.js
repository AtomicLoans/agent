/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const BN = require('bignumber.js')
const toSecs = require('@mblackmblack/to-seconds')
const bitcoin = require('bitcoinjs-lib')
const { ensure0x } = require('@liquality/ethereum-utils')
const { generateMnemonic } = require('bip39')
const { sha256, hash160 } = require('@liquality/crypto')
const { sleep } = require('@liquality/utils')
const HDWalletProvider = require('@truffle/hdwallet-provider')

const { chains, connectMetaMask, importBitcoinAddresses, importBitcoinAddressesByAddress, fundUnusedBitcoinAddress, rewriteEnv, getWeb3Chain } = require('../../common')
const { fundArbiter, fundAgent, generateSecretHashesArbiter, getLockParams, getTestContract, getTestObject, cancelLoans, fundWeb3Address, cancelJobs, restartJobs, removeFunds, removeLoans, fundTokens } = require('../loanCommon')
const { getWeb3Address } = require('../util/web3Helpers')
const { currencies } = require('../../../src/utils/fx')
const { numToBytes32 } = require('../../../src/utils/finance')
const { testLoadObject } = require('../util/contracts')
const { createCustomFund } = require('../setup/fundSetup')
const web3 = require('web3')

const { toWei } = web3.utils

chai.should()
const expect = chai.expect

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const server = 'http://localhost:3030/api/loan'
const swapServer = 'http://localhost:3030/api/swap'

const arbiterChain = chains.web3WithArbiter

function testSales (web3Chain, ethNode, btcChain) {
  describe('Sales', () => {
    it('should POST loanMarket details and return loan details', async () => {
      await createCustomFund(web3Chain, arbiterChain, 200, 'DAI') // Create Custom Loan Fund with 200 DAI

      const principal = 'DAI'
      const collateral = 'BTC'
      const principalAmount = 25
      const loanDuration = toSecs({ days: 2 })

      const { status: requestsStatus, body: requestsBody } = await chai.request(server).post('/loans/new').send({ principal, collateral, principalAmount, loanDuration })

      expect(requestsStatus).to.equal(200)
      requestsBody.should.be.a('object')

      const { id: requestId, lenderPrincipalAddress, lenderCollateralPublicKey, minimumCollateralAmount, requestCreatedAt } = requestsBody

      const borrowerPrincipalAddress = await getWeb3Address(web3Chain)

      const { address, publicKey: borrowerCollateralPublicKey } = await btcChain.client.wallet.getUnusedAddress()
      const collateralValue = Math.floor(BN(minimumCollateralAmount).times(currencies[collateral].multiplier).times(1.2).toNumber())

      const currentTime = Date.now()

      const data = Buffer.from(`${lenderCollateralPublicKey} ${principalAmount} ${principal} ${currentTime}`, 'utf8')
      const dataScript = bitcoin.payments.embed({ data: [data] })

      const proofOfFundsTxHex = await btcChain.client.chain.buildBatchTransaction([{ to: address, value: collateralValue }, { to: dataScript.output, value: 0 }])

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
      const secrets = await btcChain.client.loan.secrets.generateSecrets(secretMsg, 4)
      const secretHashes = secrets.map(secret => sha256(secret))

      const { status: requestsIdStatus, body: requestsIdBody } = await chai.request(server).post(`/loans/${requestId}/proof_of_funds`).send({
        proofOfFundsTxHex, borrowerSecretHashes: secretHashes, borrowerPrincipalAddress, borrowerCollateralPublicKey: borrowerCollateralPublicKey.toString('hex')
      })
      const {
        collateralAmount: collateralAmountActual, borrowerPrincipalAddress: borrowerPrincipalAddressActual, borrowerCollateralPublicKey: borrowerCollateralPublicKeyActual
      } = requestsIdBody

      expect(requestsIdStatus).to.equal(200)
      requestsIdBody.should.be.a('object')
      expect(BN(collateralAmountActual).times(currencies[collateral].multiplier).toNumber()).to.equal(collateralValue)
      expect(borrowerPrincipalAddressActual).to.equal(borrowerPrincipalAddress)
      expect(borrowerCollateralPublicKeyActual).to.equal(borrowerCollateralPublicKey.toString('hex'))

      let requested = false
      while (!requested) {
        await sleep(5000)
        const { body: requestedBody } = await chai.request(server).get(`/loans/${requestId}`)
        const { status } = requestedBody
        console.log(status)
        if (status === 'AWAITING_COLLATERAL') requested = true
      }

      const { body: requestedBody } = await chai.request(server).get(`/loans/${requestId}`)

      const { loanId, refundableCollateralAmount, seizableCollateralAmount, collateralRefundableP2SHAddress, collateralSeizableP2SHAddress } = requestedBody

      const values = {
        refundableValue: BN(refundableCollateralAmount).times(currencies[collateral].multiplier).toNumber(),
        seizableValue: BN(seizableCollateralAmount).times(currencies[collateral].multiplier).toNumber()
      }

      await importBitcoinAddressesByAddress([collateralRefundableP2SHAddress, collateralSeizableP2SHAddress])

      const loans = await getTestObject(web3Chain, 'loans', principal)
      const approvedBefore = await loans.methods.approved(numToBytes32(loanId)).call()
      expect(approvedBefore).to.equal(false)

      const funded = await loans.methods.funded(numToBytes32(loanId)).call()
      expect(funded).to.equal(true)

      await secondsCountDown(4)

      const expectedAwaitingCollateralStatus = await getLoanStatus(requestId)
      expect(expectedAwaitingCollateralStatus).to.equal('AWAITING_COLLATERAL')

      const lockParams = await getLockParams(web3Chain, principal, values, loanId)
      console.log('lockParams', lockParams)
      const tx = await btcChain.client.loan.collateral.lock(...lockParams)
      console.log('tx', tx)

      const balance = await btcChain.client.chain.getBalance([collateralRefundableP2SHAddress, collateralSeizableP2SHAddress])
      console.log('balance', balance)

      await secondsCountDown(4)

      console.log('Mine BTC Block')
      await chains.bitcoinWithNode.client.chain.generateBlock(1)

      await secondsCountDown(25)

      const approvedAfter = await loans.methods.approved(numToBytes32(loanId)).call()
      expect(approvedAfter).to.equal(true)

      await loans.methods.withdraw(numToBytes32(loanId), ensure0x(secrets[0])).send({ gas: 100000 })
      const withdrawn = await loans.methods.withdrawn(numToBytes32(loanId)).call()
      expect(withdrawn).to.equal(true)

      const { address: ethereumWithNodeAddress } = await chains.ethereumWithNode.client.wallet.getUnusedAddress()

      const medianizer = await testLoadObject('medianizer', getTestContract('medianizer', principal), chains.web3WithNode, ensure0x(ethereumWithNodeAddress))

      const { body: markets } = await chai.request(swapServer).get('/marketinfo')
      const market = markets.find((market) => market.to === principal)
      const { rate } = market

      await medianizer.methods.poke(numToBytes32(toWei((rate * 0.7).toString() , 'ether'))).send({ gas: 200000 })


      const liquidatorSecrets = await chains.bitcoinLiquidator.client.loan.secrets.generateSecrets('test', 1)
      const liquidatorSecret = liquidatorSecrets[0]
      console.log('liquidatorSecret', liquidatorSecret)
      const liquidatorSecretHash = sha256(liquidatorSecret)


      const liquidatorBtcAddresses = await chains.bitcoinLiquidator.client.wallet.getAddresses()
      const liquidatorBtcAddress = liquidatorBtcAddresses[0]
      const { publicKey: liquidatorPublicKey } = liquidatorBtcAddress
      const liquidatorPubKeyHash = hash160(liquidatorPublicKey.toString('hex'))

      const liquidatorAddress = await getWeb3Address(chains.web3WithLiquidator)
      const liquidatorLoans = await testLoadObject('loans', getTestContract('loans', principal), chains.web3WithLiquidator, liquidatorAddress)
      const liquidatorToken = await testLoadObject('erc20', getTestContract('erc20', principal), chains.web3WithLiquidator, liquidatorAddress)

      const discountCollateralValue = await liquidatorLoans.methods.discountCollateralValue(numToBytes32(loanId)).call()
      const ddivDiscountCollateralValue = await liquidatorLoans.methods.ddiv(toWei(discountCollateralValue.toString(), 'wei')).call()

      console.log('discountCollateralValue', discountCollateralValue)
      console.log('ddivDiscountCollateralValue', ddivDiscountCollateralValue)

      await fundWeb3Address(chains.web3WithLiquidator)
      await fundTokens(liquidatorAddress, toWei(discountCollateralValue, 'wei'), principal)
      await liquidatorToken.methods.approve(getTestContract('loans', principal), toWei(discountCollateralValue, 'wei')).send({ gas: 100000 })


      const safe = await liquidatorLoans.methods.safe(numToBytes32(loanId)).call()
      console.log('safe', safe)

      const sale = await liquidatorLoans.methods.liquidate(numToBytes32(loanId), ensure0x(liquidatorSecretHash), ensure0x(liquidatorPubKeyHash)).call()
      await liquidatorLoans.methods.liquidate(numToBytes32(loanId), ensure0x(liquidatorSecretHash), ensure0x(liquidatorPubKeyHash)).send({ gas: 1000000 })



      // const sales = await getTestObject(web3Chain, 'sales', principal)



      // const token = await testLoadObject('erc20', getTestContract('erc20', principal), chains.web3WithNode, ensure0x(ethereumWithNodeAddress))
      // await token.methods.transfer(web3Address, toWei(owedForLoan, 'wei')).send({ gas: 100000 })

      // const testToken = await getTestObject(web3Chain, 'erc20', principal)
      // await testToken.methods.approve(getTestContract('loans', principal), toWei(owedForLoan, 'wei')).send({ gas: 100000 })

      // await loans.methods.repay(numToBytes32(loanId), owedForLoan).send({ gas: 100000 })

      // const paid = await loans.methods.paid(numToBytes32(loanId)).call()
      // expect(paid).to.equal(true)

      // console.log('REPAY LOAN')
      // await secondsCountDown(25)

      // const off = await loans.methods.off(numToBytes32(loanId)).call()
      // expect(off).to.equal(true)
    })
  })
}

async function secondsCountDown (num) {
  for (let i = num; i >= 0; i--) {
    console.log(`${i}s`)
    await sleep(1000)
  }
}

async function getLoanStatus (loanId) {
  const { body } = await chai.request(server).get(`/loans/${loanId}`)
  return body.status
}

async function testSetup (web3Chain, ethNode, btcChain) {
  await ethNode.client.getMethod('jsonrpc')('miner_start')
  const address = await getWeb3Address(web3Chain)
  rewriteEnv('.env', 'METAMASK_ETH_ADDRESS', address)
  await cancelLoans(web3Chain)
  await cancelJobs(server)
  rewriteEnv('.env', 'MNEMONIC', `"${generateMnemonic(128)}"`)
  await removeFunds()
  await removeLoans()
  await fundAgent(server)
  await fundArbiter()
  await generateSecretHashesArbiter('DAI')
  await fundWeb3Address(web3Chain)
  await importBitcoinAddresses(btcChain)
  await fundUnusedBitcoinAddress(btcChain)
  await restartJobs(server)
}

function testSetupArbiter () {
  rewriteEnv('.env', 'API_OFFLINE', 'false')
  rewriteEnv('.env', 'ACCEPT_CANCEL_JOBS_OFFLINE', 'true')
}

function testAfterArbiter() {
  rewriteEnv('.env', 'API_OFFLINE', 'false')
  rewriteEnv('.env', 'ACCEPT_CANCEL_JOBS_OFFLINE', 'false')
}

describe('Lender Agent - Funds', () => {
  describe('Web3HDWallet / BitcoinJs', () => {
    before(async function () { await testSetup(chains.web3WithHDWallet, chains.ethereumWithNode, chains.bitcoinWithJs) })
    testSales(chains.web3WithHDWallet, chains.ethereumWithNode, chains.bitcoinWithJs)
  })

  // describe.only('Web3HDWallet / BitcoinJs', () => {
  //   before(async function () {
  //     await testSetup(chains.web3WithHDWallet, chains.ethereumWithNode, chains.bitcoinWithJs)
  //     testSetupArbiter()
  //   })
  //   after(function() {
  //     testAfterArbiter()
  //   })
  //   testSales(chains.web3WithHDWallet, chains.ethereumWithNode, chains.bitcoinWithJs)
  // })

  // describe('MetaMask / BitcoinJs', () => {
  //   connectMetaMask()
  //   before(async function () { await testSetup(chains.web3WithMetaMask, chains.ethereumWithNode, chains.bitcoinWithJs) })
  //   testE2E(chains.web3WithMetaMask, chains.bitcoinWithJs)
  // })

  // describe('MetaMask / Ledger', () => {
  //   connectMetaMask()
  //   before(async function () { await testSetup(chains.web3WithMetaMask, chains.bitcoinWithLedger) })
  //   testE2E(chains.web3WithMetaMask, chains.bitcoinWithLedger)
  // })
})
