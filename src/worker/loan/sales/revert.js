const axios = require('axios')
const log = require('@mblackmblack/node-pretty-log')
const Sale = require('../../../models/Sale')
const Loan = require('../../../models/Loan')
const Agent = require('../../../models/Agent')
const AgendaJob = require('../../../models/AgendaJob')
const { numToBytes32 } = require('../../../utils/finance')
const { getObject } = require('../../../utils/contracts')
const { getInterval } = require('../../../utils/intervals')
const { getInitArgs } = require('../utils/collateralSwap')
const handleError = require('../../../utils/handleError')

function defineSalesRevertJobs (agenda) {
  agenda.define('revert-init-liquidation', async (job, done) => {
    console.log('revert-init-liquidation')

    try {
      const { data } = job.attrs
      const { saleModelId } = data

      const sale = await Sale.findOne({ _id: saleModelId }).exec()
      const { loanModelId, collateralSwapRefundableP2SHAddress, saleId } = sale

      const loan = await Loan.findOne({ _id: loanModelId }).exec()
      const { collateralRefundableP2SHAddress, collateralSeizableP2SHAddress, loanId, principal, collateral } = loan

      const swapParams = await getInitArgs(numToBytes32(loanId), numToBytes32(saleId), principal, collateral)

      const refundableUnspent = await loan.collateralClient().getMethod('getUnspentTransactions')([collateralSwapRefundableP2SHAddress])

      if (refundableUnspent.length > 0) {
        const lockTxHash = refundableUnspent[0].txid
        const party = 'arbiter'

        const outputs = [{ address: collateralRefundableP2SHAddress }, { address: collateralSeizableP2SHAddress }]

        const multisigParams = [lockTxHash, ...swapParams, party, outputs]
        log('info', `Revert Init Liquidation Job | Multisig Params ${multisigParams}`)
        const agentSigs = await loan.collateralClient().loan.collateralSwap.multisigWrite(...multisigParams)

        const exampleRSSigValue = '0000000000000000000000000000000000000000000000000000000000000000'
        const exampleSig = `30440220${exampleRSSigValue}0220${exampleRSSigValue}01`

        const sigs = {
          refundable: [Buffer.from(agentSigs.refundableSig, 'hex'), Buffer.from(exampleSig, 'hex')],
          seizable: [Buffer.from(agentSigs.seizableSig, 'hex'), Buffer.from(exampleSig, 'hex')]
        }

        log('info', `Revert Init Liquidation Job | Multisig Make Params ${lockTxHash} ${sigs} ${swapParams} ${outputs}`)
        const multisigSendTxRaw = await loan.collateralClient().loan.collateralSwap.multisigMake(lockTxHash, sigs, ...swapParams, outputs)
        log('info', `Revert Init Liquidation Job | multisigSendTxRaw ${multisigSendTxRaw}`)

        const multisigSendTx = await loan.collateralClient().getMethod('decodeRawTransaction')(multisigSendTxRaw)
        const multisigSendVouts = multisigSendTx._raw.data.vout

        let refundableAmount, seizableAmount
        if (multisigSendVouts[0].scriptPubKey.addresses[0] === collateralRefundableP2SHAddress) {
          refundableAmount = multisigSendVouts[0].value
          seizableAmount = multisigSendVouts[1].value
        } else {
          refundableAmount = multisigSendVouts[1].value
          seizableAmount = multisigSendVouts[0].value
        }

        const loans = getObject('loans', principal)

        const { lender: lenderPrincipalAddress } = await loans.methods.loans(numToBytes32(loanId)).call()

        console.log('lenderPrincipalAddress', lenderPrincipalAddress)

        loan.lenderPrincipalAddress = lenderPrincipalAddress
        await loan.save()

        try {
          const agent = await Agent.findOne({ principalAddress: lenderPrincipalAddress }).exec()

          if (agent) {
            const { url } = agent

            console.log(`${url}/sales/contract/${principal}/${saleId}/revert`)
            console.log({ principal, saleId, arbiterSigs: agentSigs, refundableAmount, seizableAmount })
            const { data } = await axios.post(`${url}/sales/contract/${principal}/${saleId}/revert`, { arbiterSigs: agentSigs, refundableAmount, seizableAmount })
            const { txHash } = data

            sale.revertTxHash = txHash
            sale.status = 'COLLATERAL_REVERTING'
            await sale.save()

            await agenda.schedule(getInterval('CHECK_BTC_TX_INTERVAL'), 'verify-revert-init-liquidation', { saleModelId })
          } else {
            log('error', `Revert Init Liquidation Job | Agent with principal address ${lenderPrincipalAddress} not found`)
          }
        } catch (e) {
          console.log('AGENT NOT FOUND OR OFFLINE')
          log('error', `Revert Init Liquidation Job | ${e}`)
        }
      }
    } catch (e) {
      handleError(e)
      console.log('REVERT-INIT-ERROR')
      console.log(e)
    }

    done()
  })

  agenda.define('verify-revert-init-liquidation', async (job, done) => {
    console.log('verify-revert-init-liquidation')

    try {
      const { data } = job.attrs
      const { saleModelId } = data

      const sale = await Sale.findOne({ _id: saleModelId }).exec()
      const { loanModelId } = sale

      const loan = await Loan.findOne({ _id: loanModelId }).exec()
      const { collateralRefundableP2SHAddress, collateralSeizableP2SHAddress } = loan

      const minConfirmations = 1

      const [refundableBalance, seizableBalance, refundableUnspent, seizableUnspent] = await Promise.all([
        loan.collateralClient().chain.getBalance([collateralRefundableP2SHAddress]),
        loan.collateralClient().chain.getBalance([collateralSeizableP2SHAddress]),
        loan.collateralClient().getMethod('getUnspentTransactions')([collateralRefundableP2SHAddress]),
        loan.collateralClient().getMethod('getUnspentTransactions')([collateralSeizableP2SHAddress])
      ])

      const collateralRequirementsMet = (refundableBalance.toNumber() >= 0 && seizableBalance.toNumber() >= 0)
      const refundableConfirmationRequirementsMet = refundableUnspent.length === 0 ? false : refundableUnspent.every(unspent => unspent.confirmations >= minConfirmations)
      const seizableConfirmationRequirementsMet = seizableUnspent.length === 0 ? false : seizableUnspent.every(unspent => unspent.confirmations >= minConfirmations)

      if (collateralRequirementsMet && refundableConfirmationRequirementsMet && seizableConfirmationRequirementsMet) {
        sale.status = 'COLLATERAL_REVERTED'
        await sale.save()
      } else {
        // TODO: check if actually claimed instead

        const alreadyQueuedJobs = await AgendaJob.find({ name: 'verify-revert-init-liquidation', nextRunAt: { $ne: null }, data: { saleModelId } }).exec()

        if (alreadyQueuedJobs.length <= 0) {
          await agenda.schedule(getInterval('CHECK_BTC_TX_INTERVAL'), 'verify-revert-init-liquidation', { saleModelId })
        }
      }
    } catch (e) {
      handleError(e)
      console.log('VERIFY-REVERT-INIT-ERROR')
      console.log(e)
    }

    done()
  })
}

module.exports = {
  defineSalesRevertJobs
}
