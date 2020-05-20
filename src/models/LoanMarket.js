const mongoose = require('mongoose')
const { checksumEncode } = require('@liquality/ethereum-utils')

const clients = require('../utils/clients')
const web3 = require('../utils/web3')

const HotColdWalletProxy = require('../models/HotColdWalletProxy')

const { HOT_COLD_WALLET_PROXY_ENABLED } = process.env

const LoanMarketSchema = new mongoose.Schema({
  principal: {
    type: String,
    index: true
  },
  collateral: {
    type: String,
    index: true
  },
  totalCollateralValue: {
    type: Number,
    index: true,
    default: 0
  },
  chain: {
    type: String,
    index: true
  },
  minPrincipal: {
    type: Number
  },
  maxPrincipal: {
    type: Number
  },
  minCollateral: {
    type: Number
  },
  maxCollateral: {
    type: Number
  },
  minLoanDuration: {
    type: Number
  },
  minConf: {
    type: Number
  },
  requestExpiresIn: {
    type: Number
  },
  fundCreateTxHash: {
    type: String
  },
  secretIndex: {
    type: Number,
    default: 0
  },
  loanIndex: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    index: true
  }
})

LoanMarketSchema.index({ principal: 1, collateral: 1 }, { unique: true })

LoanMarketSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v
  delete json.secretIndex
  delete json.loanIndex

  return json
}

LoanMarketSchema.methods.principalClient = function () {
  return clients[this.chain]
}

LoanMarketSchema.methods.collateralClient = function () {
  return clients[this.collateral]
}

LoanMarketSchema.methods.getAgentAddresses = async function () {
  const principalHotAddresses = await web3().currentProvider.getAddresses()
  const collateralAddresses = await this.collateralClient().wallet.getAddresses()

  const agentAddresses = {
    collateralAddress: collateralAddresses[0].address,
    collateralPublicKey: collateralAddresses[0].publicKey.toString('hex'),
    proxyEnabled: HOT_COLD_WALLET_PROXY_ENABLED
  }

  if (HOT_COLD_WALLET_PROXY_ENABLED) {
    agentAddresses.principalHotAddress = checksumEncode(principalHotAddresses[0])
    agentAddresses.principalAgentAddress = checksumEncode(principalHotAddresses[0])

    const { principal, collateral } = this
    const hotColdWallet = await HotColdWalletProxy.findOne({ principal, collateral }).exec()
    if (hotColdWallet) {
      agentAddresses.principalColdAddress = hotColdWallet.coldWalletAddress
      agentAddresses.principalAddress = hotColdWallet.contractAddress
    }
  } else {
    agentAddresses.principalAddress = checksumEncode(principalHotAddresses[0])
    agentAddresses.principalAgentAddress = checksumEncode(principalHotAddresses[0])
  }

  return agentAddresses
}

module.exports = mongoose.model('LoanMarket', LoanMarketSchema)
