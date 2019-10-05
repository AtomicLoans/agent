const axios = require('axios')
const BN = require('bignumber.js')
const Agent = require('../../../models/Agent')
const AgentFund = require('../../../models/AgentFund')
const { getObject, getContract } = require('../../../utils/contracts')
const { numToBytes32 } = require('../../../utils/finance')
const { currencies } = require('../../../utils/fx')
const web3 = require('web3')
const { hexToNumber } = web3.utils

function defineAgentStatusJobs (agenda) {
  agenda.define('check-lender-status', async (job, done) => {
    const agents = await Agent.find().exec()

    for (let i = 0; i < agents.length; i++) {
      const agent = agents[i]
      await agenda.now('check-agent', { agentModelId: agent.id })
    }

    done()
  })

  agenda.define('check-agent', async (job, done) => {
    const { data } = job.attrs
    const { agentModelId } = data

    const agent = await Agent.findOne({ _id: agentModelId }).exec()

    let lenderStatus, loanMarkets
    try {
      const { status, data } = await axios.get(`${agent.url}/loanmarketinfo`)

      console.log(`${agent.url} status:`, status)

      loanMarkets = data
      lenderStatus = status
    } catch(e) {
      lenderStatus = 401
    }

    if (lenderStatus === 200) {
      agent.status = 'ACTIVE'

      // get agent principal address, and check if a fund exists for each loanmarket, if a fund does exist, update the balance

      try {
        for (let i = 0; i < loanMarkets.length; i++) {
          const loanMarket = loanMarkets[i]
          const { principal, collateral } = loanMarket
          const multiplier = currencies[principal].multiplier
          const decimals = currencies[principal].decimals

          const { data: { principalAddress } } = await axios.get(`${agent.url}/agentinfo/${loanMarket.id}`)

          const funds = getObject('funds', principal)
          const loans = getObject('loans', principal)

          const fundId = await funds.methods.fundOwner(principalAddress).call()
          const marketLiquidity = await funds.methods.balance(fundId).call()

          let borrowed = 0
          const lenderLoanCount = await loans.methods.lenderLoanCount(principalAddress).call()
          for (let j = 0; j < lenderLoanCount; j++) {
            const loanId = await loans.methods.lenderLoans(principalAddress, j).call()
            const loanPrincipal = await loans.methods.principal(loanId).call()
            borrowed = BN(borrowed).plus(loanPrincipal)
          }

          const supplied = BN(borrowed).plus(marketLiquidity)
          const utilizationRatio = supplied.toNumber() === 0 ? 0 : BN(borrowed).dividedBy(supplied).toFixed(4)

          const marketLiquidityFormatted = BN(marketLiquidity).dividedBy(multiplier).toFixed(decimals)
          const borrowedFormatted = BN(borrowed).dividedBy(multiplier).toFixed(decimals)
          const suppliedFormatted = BN(supplied).dividedBy(multiplier).toFixed(decimals)

          const agentFund = await AgentFund.findOne({ principal, collateral, principalAddress }).exec()
          if (agentFund) {
            agentFund.utilizationRatio = utilizationRatio
            agentFund.marketLiquidity = marketLiquidityFormatted
            agentFund.borrowed = borrowedFormatted
            agentFund.supplied = suppliedFormatted
            agentFund.fundId = hexToNumber(fundId)
            agentFund.url = agent.url
            agentFund.status = 'ACTIVE'
            await agentFund.save()
          } else {
            const params = {
              principal, collateral, principalAddress, utilizationRatio, fundId: hexToNumber(fundId), url: agent.url,
              marketLiquidity: marketLiquidityFormatted, borrowed: borrowedFormatted, supplied: suppliedFormatted
            }
            const newAgentFund = AgentFund.fromAgentFundParams(params)
            await newAgentFund.save()
          }
        }
      } catch (e) {
        console.log(e)
      }
    } else {
      agent.status = 'INACTIVE'

      const agentFunds = await AgentFund.find({ principalAddress: agent.principalAddress }).exec()

      for (let i = 0; i < agentFunds.length; i++) {
        const agentFund = agentFunds[i]
        agentFund.status = 'INACTIVE'
        await agentFund.save()
      }
    }
    await agent.save()

    done()
  })
}

module.exports = {
  defineAgentStatusJobs
}
