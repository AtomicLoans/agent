const mongoose = require('mongoose')

const AgentSchema = new mongoose.Schema({
  ethSigner: {
    type: String,
    index: true
  },
  endpoint: {
    type: String,
    index: true
  },
  url: {
    type: String,
    index: true
  },
  testUrl: {
    type: String,
    index: true
  },
  principalAddress: {
    type: String,
    index: true
  },
  collateralPublicKey: {
    type: String,
    index: true
  }
})

AgentSchema.methods.json = function () {
  const json = this.toJSON()
  json.id = json._id

  delete json._id
  delete json.__v

  return json
}

AgentSchema.static('fromAgentParams', function (params) {
  return new Agent({
    ethSigner: params.ethSigner,
    endpoint: params.endpoint,
    url: params.url,
    testUrl: params.testUrl,
    principalAddress: params.principalAddress,
    collateralPublicKey: params.collateralPublicKey
  })
})

const Agent = mongoose.model('Agent', AgentSchema)
module.exports = Agent
