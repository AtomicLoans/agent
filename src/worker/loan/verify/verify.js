const date = require('date.js')
const log = require('@mblackmblack/node-pretty-log')
const capitalize = require('capitalize')

const Fund = require('../../../models/Fund')
const Loan = require('../../../models/Loan')
const Sale = require('../../../models/Sale')
const EthTx = require('../../../models/EthTx')
const AgendaJob = require('../../../models/AgendaJob')
const { getInterval } = require('../../../utils/intervals')
const { bumpTxFee, sendTransaction } = require('../utils/web3Transaction')
const web3 = require('../../../utils/web3')
const { getFunctions } = require('./functions')

const verifyJobs = [
  'create-fund',
  'approve-loan',
  'accept-or-cancel-loan',
  'request-loan',
  'accept-sale'
]

function defineVerifyJobs (agenda) {
  for (const verifyJob of verifyJobs) {
    agenda.define(`verify-${verifyJob}`, async (job, done) => {
      await verify(job, done, agenda)
    })
  }
}

async function verify (job, done, agenda) {
  const { data } = job.attrs
  const { jobName, modelName, modelId, txHashName } = data
  const { verifySuccess, txSuccess, txFailure } = getFunctions(modelName, jobName)

  const fullJobName = `${capitalize.words(jobName.replace(/-/g, ' '))} ${modelName}`

  log('info', `Verify ${fullJobName} Job | ${modelName} Model ID: ${modelId} | Starting`)

  let instance
  switch (modelName) {
    case 'Fund':
      instance = await Fund.findOne({ _id: modelId }).exec()
      break
    case 'Loan':
      instance = await Loan.findOne({ _id: modelId }).exec()
      break
    case 'Sale':
      instance = await Sale.findOne({ _id: modelId }).exec()
      break
    default: {
      const instanceError = `Verify ${fullJobName} Job | ${modelName} not Fund, Loan or Sale`
      log('error', instanceError)
      throw Error(instanceError)
    }
  }

  if (!instance) return log('error', `Verify ${fullJobName} Job | ${modelName} not found with ${modelName} Model ID: ${modelId}`)
  const receipt = await web3().eth.getTransactionReceipt(instance[txHashName])

  if (receipt === null) {
    log('info', `Verify ${fullJobName} Job | ${modelName} Model ID: ${modelId} | Transaction not confirmed`)

    const ethTx = await EthTx.findOne({ _id: instance.ethTxId }).exec()
    if (!ethTx) return log('error', `Verify ${fullJobName} Job | EthTx not found with EthTx ID: ${instance.ethTxId}`)

    if (date(getInterval('BUMP_TX_INTERVAL')) > ethTx.updatedAt && instance.status !== 'FAILED') {
      log('warn', `Verify ${fullJobName} Job | ${modelName} Model ID: ${modelId} | EthTx ID: ${instance.ethTxId} | Bumping Tx Fee`)
      await bumpTxFee(ethTx)
      await sendTransaction(ethTx, instance, agenda, done, txSuccess, txFailure)
    } else {
      const alreadyQueuedJobs = await AgendaJob.find({ name: `verify-${jobName}-${modelName.toLowerCase()}`, nextRunAt: { $ne: null }, data: { modelId } }).exec()

      if (alreadyQueuedJobs.length <= 1) {
        await agenda.schedule(getInterval('CHECK_TX_INTERVAL'), `verify-${jobName}-${modelName.toLowerCase()}`, { jobName, modelId, modelName, txHashName })
      }
    }
  } else if (receipt.status === false) {
    log('error', `Verify ${fullJobName} Job | ${modelName} Model ID: ${modelId} | EthTx ID: ${instance.ethTxId} | Tx was mined but has been reverted by the EVM`)

    instance.status = 'FAILED'
    await instance.save()

    const ethTx = await EthTx.findOne({ _id: instance.ethTxId }).exec()
    if (!ethTx) return log('error', `Verify ${fullJobName} Job | EthTx not found with EthTx ID: ${instance.ethTxId}`)

    ethTx.failed = false
    ethTx.error = 'Transaction has been reverted by the EVM'
    await ethTx.save()
  } else {
    log('info', `Verify ${fullJobName} Job | ${modelName} Model ID: ${modelId} | Tx confirmed`)
    await verifySuccess(instance, agenda, receipt)
  }

  done()
}

module.exports = {
  defineVerifyJobs
}
