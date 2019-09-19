const getWeb3 = require('./web3')

const schema = {}

schema.funds = require('../abi/funds')
schema.loans = require('../abi/loans')
schema.sales = require('../abi/sales')
schema.erc20 = require('../abi/erc20')

function loadObject (type, address) {
  const web3 = getWeb3()
  return new web3.eth.Contract(schema[type].abi, address)
}

async function getObject (contract, principal) {
  if (contract === 'erc20' || contract === 'ctoken') {
    const cPrefix = contract === 'ctoken' ? 'C' : ''
    return loadObject(contract, process.env[`${cPrefix}${principal}_ADDRESS`])
  } else {
    return loadObject(contract, process.env[`${principal}_LOAN_${contract.toUpperCase()}_ADDRESS`])
  }
}

async function getObjects (contracts, principal) {
  const objects = []
  for (const contract of contracts) {
    const object = await getObject(contract, principal)
    objects.push(object)
  }
  return objects
}

module.exports = {
  loadObject,
  getObject,
  getObjects
}
