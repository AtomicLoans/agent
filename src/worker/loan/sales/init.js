const axios = require('axios')
const BN = require('bignumber.js')
const { remove0x } = require('@liquality/ethereum-utils')
const { sha256 } = require('@liquality/crypto')
const Sale = require('../../../models/Sale')
const Loan = require('../../../models/Loan')
const Secret = require('../../../models/Secret')
const { getCurrentTime } = require('../../../utils/time')
const { currencies } = require('../../../utils/fx')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { getLockArgs, getCollateralAmounts } = require('../utils/collateral')
const { getInitArgs } = require('../utils/collateralSwap')
const { isArbiter } = require('../../../utils/env')
const { getMarketModels } = require('../utils/models')
const { getEndpoint } = require('../../../utils/endpoints')
const clients = require('../../../utils/clients')

const web3 = require('web3')
const { toWei, hexToNumber } = web3.utils

function defineSalesInitJobs (agenda) {
  agenda.define('init-liquidation', async (job, done) => {
    console.log('init-liquidation')

    const { data } = job.attrs
    const { loanModelId, lenderSigs } = data

    const loan = await Loan.findOne({ _id: loanModelId }).exec()
    const { loanId, principal, collateral } = loan

    const { market } = await getMarketModels(principal, collateral)
    const { rate } = market

    let refundableValue, seizableValue
    if (isArbiter()) {
      const { refundableAmount, seizableAmount } = data
      refundableValue = Math.floor(BN(refundableAmount).times(currencies[collateral].multiplier).toFixed(currencies[collateral].decimals))
      seizableValue = Math.floor(BN(seizableAmount).times(currencies[collateral].multiplier).toFixed(currencies[collateral].decimals))
    }

    const loans = getObject('loans', principal)
    const sales = getObject('sales', principal)

    const next = await sales.methods.next(numToBytes32(loanId)).call()
    const saleIndexByLoan = next - 1
    const saleIdBytes32 = await sales.methods.saleIndexByLoan(numToBytes32(loanId), saleIndexByLoan).call()
    const saleId = hexToNumber(saleIdBytes32)

    const swapParams = await getInitArgs(numToBytes32(loanId), numToBytes32(saleId), principal, collateral)
    const initAddresses = await loan.collateralClient().loan.collateralSwap.getInitAddresses(...swapParams)
    const { refundableAddress: refundableSwapAddress, seizableAddress: seizableSwapAddress } = initAddresses

    const lockArgs = await getLockArgs(numToBytes32(loanId), principal, collateral)
    const lockAddresses = await loan.collateralClient().loan.collateral.getLockAddresses(...lockArgs)
    const { refundableAddress, seizableAddress } = lockAddresses
    const newCollateralAmounts = await getCollateralAmounts(numToBytes32(loanId), loan, rate)
    const { refundableCollateral: collateralSwapRefundableAmount, seizableCollateral: collateralSwapSeizableAmount } = newCollateralAmounts

    const refundableUnspent = await loan.collateralClient().getMethod('getUnspentTransactions')([lockAddresses.refundableAddress])

    if (refundableUnspent.length > 0) {
      const lockTxHash = refundableUnspent[0].txid
      const party = isArbiter() ? 'arbiter' : 'lender'

      let outputs
      if (isArbiter()) {

        console.log('IS_ARBITER')
        console.log('refundableValue', refundableValue)
        console.log('seizableValue', seizableValue)

        outputs = [{ address: initAddresses.refundableAddress }, { address: initAddresses.seizableAddress }]
      } else {
        outputs = [{ address: initAddresses.refundableAddress }, { address: initAddresses.seizableAddress }]
      }
      
      const exampleRSSigValue = '0000000000000000000000000000000000000000000000000000000000000000'
      const exampleSig = `30440220${exampleRSSigValue}0220${exampleRSSigValue}01`

      const multisigParams = [lockTxHash, ...lockArgs, party, outputs]
      const agentSigs = await loan.collateralClient().loan.collateral.multisigSign(...multisigParams)

      let sigs
      if (isArbiter()) {
        sigs = {
          refundable: [Buffer.from(lenderSigs.refundableSig, 'hex'), Buffer.from(agentSigs.refundableSig, 'hex')],
          seizable: [Buffer.from(lenderSigs.seizableSig, 'hex'), Buffer.from(agentSigs.seizableSig, 'hex')]
        }
      } else {
        sigs = {
          refundable: [Buffer.from(agentSigs.refundableSig, 'hex'), Buffer.from(exampleSig, 'hex')],
          seizable: [Buffer.from(agentSigs.seizableSig, 'hex'), Buffer.from(exampleSig, 'hex')]
        }
      }

      const multisigSendTxRaw = await loan.collateralClient().loan.collateral.multisigBuild(lockTxHash, sigs, ...lockArgs, outputs)
      console.log('multisigSendTxRaw', multisigSendTxRaw)

      const { secretHashB, secretHashC } = await sales.methods.secretHashes(numToBytes32(saleId)).call()

      const saleParams = { refundableSwapAddress, seizableSwapAddress, secretHashB, secretHashC, saleIndexByLoan, saleId, principal, collateral, loanModelId }
      const sale = Sale.fromParams(saleParams)
      sale.loan = loan

      const multisigSendTx = await loan.collateralClient().getMethod('decodeRawTransaction')(multisigSendTxRaw)
      const multisigSendVouts = multisigSendTx._raw.data.vout
      const multisigSendVins = multisigSendTx._raw.data.vin

      let refundableAmount, seizableAmount
      if (multisigSendVouts[0].scriptPubKey.addresses[0] === refundableSwapAddress) {
        refundableAmount = multisigSendVouts[0].value
        seizableAmount = multisigSendVouts[1].value
      } else {
        refundableAmount = multisigSendVouts[1].value
        seizableAmount = multisigSendVouts[0].value
      }

      sale.collateralSwapRefundableAmount = refundableAmount
      sale.collateralSwapSeizableAmount = seizableAmount

      if (isArbiter()) {
        const txHash = await loan.collateralClient().chain.sendRawTransaction(multisigSendTxRaw)
        console.log('txHash', txHash)

        sale.initTxHash = txHash
        sale.status = 'COLLATERAL_SENDING'
      } else {
        await axios.post(`${getEndpoint('ARBITER_ENDPOINT')}/sales/new`, { principal, loanId, lenderSigs: agentSigs, refundableAmount, seizableAmount })
      }

      const latestCollateralBlock = await loan.collateralClient().getMethod('getBlockHeight')()
      sale.latestCollateralBlock = latestCollateralBlock

      await sale.save()

      await agenda.schedule(getInterval('CHECK_BTC_TX_INTERVAL'), 'verify-init-liquidation', { saleModelId: sale.id })
    } else {
      console.log('CANNOT START LIQUIDATION BECAUSE COLLATERAL DOESN\'T EXIST')
    }
    done()
  })

  agenda.define('verify-init-liquidation', async (job, done) => {
    const { data } = job.attrs
    const { saleModelId } = data

    const sale = await Sale.findOne({ _id: saleModelId }).exec()
    if (!sale) return console.log('Error: Sale not found')
    const { saleId, principal } = sale

    if (!isArbiter() && !sale.initTxHash) {
      console.log("`${getEndpoint('ARBITER_ENDPOINT')}/sales/contract/${principal}/${saleId}`", `${getEndpoint('ARBITER_ENDPOINT')}/sales/contract/${principal}/${saleId}`)
      const { data: arbiterSale } = await axios.get(`${getEndpoint('ARBITER_ENDPOINT')}/sales/contract/${principal}/${saleId}`)
      sale.initTxHash = arbiterSale.initTxHash
    }

    const { initTxHash, collateralSwapRefundableP2SHAddress, collateralSwapSeizableP2SHAddress, collateralSwapRefundableAmount, collateralSwapSeizableAmount } = sale

    if (!isArbiter() && initTxHash) {
      sale.status = 'COLLATERAL_SENDING'
    }

    const [refundableBalance, seizableBalance, refundableUnspent, seizableUnspent] = await Promise.all([
      sale.collateralClient().chain.getBalance([collateralSwapRefundableP2SHAddress]),
      sale.collateralClient().chain.getBalance([collateralSwapSeizableP2SHAddress]),
      sale.collateralClient().getMethod('getUnspentTransactions')([collateralSwapRefundableP2SHAddress]),
      sale.collateralClient().getMethod('getUnspentTransactions')([collateralSwapSeizableP2SHAddress])
    ])

    const collateralRequirementsMet = (refundableBalance.toNumber() >= collateralSwapRefundableAmount && seizableBalance.toNumber() >= collateralSwapSeizableAmount)
    const refundableConfirmationRequirementsMet = refundableUnspent.length === 0 ? false : refundableUnspent[0].confirmations > 0
    const seizableConfirmationRequirementsMet = seizableUnspent.length === 0 ? false : seizableUnspent[0].confirmations > 0

    if (collateralRequirementsMet && refundableConfirmationRequirementsMet && seizableConfirmationRequirementsMet) {
      console.log('COLLATERAL SENT')
      sale.status = 'COLLATERAL_SENT'

      if (isArbiter()) {
        const secretModel = await Secret.findOne({ secretHash: sale.secretHashC }).exec()
        const { secret } = secretModel

        if (sha256(secret) === sale.secretHashC) {
          console.log('ARBITER SECRET MATCHES')
          sale.secretC = secret
          sale.status = 'SECRETS_PROVIDED'
        } else {
          console.log('ARBITER SECRET DOESN\'T MATCH')
          console.log('secret', secret)
          console.log('sale', sale)
        }
      } else {
        const { loanModelId } = sale

        const loan = await Loan.findOne({ _id: loanModelId }).exec()
        const secret = loan.lenderSecrets[1]

        if (sha256(secret) === sale.secretHashB) {
          console.log('LENDER SECRET MATCHES')
          sale.secretB = secret
          sale.status = 'SECRETS_PROVIDED'
        } else {
          console.log('LENDER SECRET DOESN\'T MATCH')
          console.log('secret', secret)
          console.log('sale', sale)
        }
      }
 
      // await agenda.schedule(getInterval('ACTION_INTERVAL'), 'approve-loan', { loanModelId: loan.id })
    } else {
      await agenda.schedule(getInterval('CHECK_BTC_TX_INTERVAL'), 'verify-init-liquidation', { saleModelId })
    }

    await sale.save()

    done()
  })
}

module.exports = {
  defineSalesInitJobs
}
