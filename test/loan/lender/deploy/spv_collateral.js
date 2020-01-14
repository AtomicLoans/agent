/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')
const { ensure0x, remove0x } = require('@liquality/ethereum-utils')
const isCI = require('is-ci')
const bitcoin = require('@mblackmblack/bitcoinjs-lib')

const { chains, importBitcoinAddresses, fundUnusedBitcoinAddress } = require('../../../common')
const { numToBytes32 } = require('../../../../src/utils/finance')
const { testLoadObject } = require('../../util/contracts')
const { getTestContract, getTestObject } = require('../../loanCommon')

chai.should()
const expect = chai.expect
chai.use(chaiHttp)
chai.use(chaiAsPromised)

const loanId = process.env.LOAN
const principal = process.env.PRINCIPAL

async function getPubKeys (contract, instance) {
  let { borrowerPubKey, lenderPubKey, arbiterPubKey } = await contract.methods.pubKeys(instance).call()
  borrowerPubKey = remove0x(borrowerPubKey)
  lenderPubKey = remove0x(lenderPubKey)
  arbiterPubKey = remove0x(arbiterPubKey)

  return { borrowerPubKey, lenderPubKey, arbiterPubKey }
}

async function getSecretHashes (contract, instance) {
  let { secretHashA1, secretHashB1, secretHashC1 } = await contract.methods.secretHashes(instance).call()
  secretHashA1 = remove0x(secretHashA1)
  secretHashB1 = remove0x(secretHashB1)
  secretHashC1 = remove0x(secretHashC1)

  return { secretHashA1, secretHashB1, secretHashC1 }
}

async function getExpirations (contract, instance) {
  const approveExpiration = parseInt(remove0x((await contract.methods.approveExpiration(instance).call()).toString()))
  const liquidationExpiration = parseInt(remove0x((await contract.methods.liquidationExpiration(instance).call()).toString()))
  const seizureExpiration = parseInt(remove0x((await contract.methods.seizureExpiration(instance).call()).toString()))

  return { approveExpiration, liquidationExpiration, seizureExpiration }
}

async function getCollateralParams (contract, instance) {
  const pubKeys = await getPubKeys(contract, instance)
  const secretHashes = await getSecretHashes(contract, instance)
  const expirations = await getExpirations(contract, instance)

  return { pubKeys, secretHashes, expirations }
}

function addCollateral (web3Chain, btcChain) {
  describe('Deposit Collateral using SPV', () => {
    it('should deposit collateral and update collateral balance on eth contract using spv manager', async () => {
      const { address: ethereumWithNodeAddress } = await chains.ethereumWithNode.client.wallet.getUnusedAddress()

      const loans = await getTestObject(web3Chain, 'loans', principal)
      const onDemandSpv = await testLoadObject('ondemandspv', getTestContract('ondemandspv', principal), chains.web3WithNode, ensure0x(ethereumWithNodeAddress))

      const { seizeRequestIDOneConf } = await loans.methods.loanRequests(numToBytes32(loanId)).call()

      const collateralValueBeforeAddingCollateral = await loans.methods.collateral(numToBytes32(loanId)).call()

      const addSeizableValue = Math.ceil(collateralValueBeforeAddingCollateral / 2)

      const colParams = await getCollateralParams(loans, numToBytes32(loanId))

      const lockSeizableParams = [addSeizableValue, colParams.pubKeys, colParams.secretHashes, colParams.expirations]
      const lockSeizableTxHash = await btcChain.client.loan.collateral.lockSeizable(...lockSeizableParams)
      const lockSeizableTxHashForProof = ensure0x(Buffer.from(lockSeizableTxHash, 'hex').reverse().toString('hex'))

      const lockSeizableTxRaw = await btcChain.client.getMethod('getRawTransactionByHash')(lockSeizableTxHash)
      const lockSeizableTx = await btcChain.client.getMethod('decodeRawTransaction')(lockSeizableTxRaw)
      const lockSeizableP2WSHVout = lockSeizableTx._raw.data.vout.find(vout => vout.scriptPubKey.type === 'witness_v0_scripthash')

      const lockSeizableBitcoinJsTx = bitcoin.Transaction.fromHex(lockSeizableTxRaw)
      const lockSeizableVin = ensure0x(lockSeizableBitcoinJsTx.getVin())
      const lockSeizableVout = ensure0x(lockSeizableBitcoinJsTx.getVout())

      await btcChain.client.chain.generateBlock(1)

      const inputIndex = 0
      const outputIndex = lockSeizableP2WSHVout.n

      // SPV FILL REQUEST SEIZABLE COLLATERAL ONE CONFIRMATION
      const fillSeizeRequestOneConfSuccess = await onDemandSpv.methods.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, inputIndex, outputIndex).call()
      await onDemandSpv.methods.fillRequest(lockSeizableTxHashForProof, lockSeizableVin, lockSeizableVout, seizeRequestIDOneConf, inputIndex, outputIndex).send({ gas: 1000000 })
      expect(fillSeizeRequestOneConfSuccess).to.equal(true)

      const collateralValueAfterAddingCollateral = await loans.methods.collateral(numToBytes32(loanId)).call()

      console.info('collateralValueBeforeAddingCollateral:', collateralValueBeforeAddingCollateral)
      console.info('collateralValueAfterAddingCollateral: ', collateralValueAfterAddingCollateral)
    })
  })
}

async function testSetup (btcChain) {
  const blockHeight = await btcChain.client.chain.getBlockHeight()
  if (blockHeight < 101) {
    await btcChain.client.chain.generateBlock(101)
  }

  await importBitcoinAddresses(btcChain)
  await fundUnusedBitcoinAddress(btcChain)
}

if (!isCI) {
  describe('Lender Agent', () => {
    describe('Web3HDWallet / BitcoinJs', () => {
      before(async function () { await testSetup(chains.bitcoinWithJs) })
      addCollateral(chains.web3WithHDWallet, chains.bitcoinWithJs)
    })
  })
}
