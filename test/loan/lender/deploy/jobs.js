/* eslint-env mocha */
const chai = require('chai')
const chaiHttp = require('chai-http')
const chaiAsPromised = require('chai-as-promised')

const { cancelJobs } = require('../../loanCommon')

chai.should()

chai.use(chaiHttp)
chai.use(chaiAsPromised)

const lenderServer = 'http://localhost:3030/api/loan'
const arbiterServer = 'http://localhost:3032/api/loan'

function stopJobs (web3Chain) {
  describe('Stop Jobs', () => {
    it('Should stop jobs for lender and arbiter agents', async () => {
      await cancelJobs(lenderServer)
      await cancelJobs(arbiterServer)
    })
  })
}

describe('Agent Jobs', () => {
  stopJobs()
})
