const fundsCreate = require('../funds/create')
const loansRequest = require('../loans/request')
const loansApprove = require('../loans/approve')
const loansAcceptOrCancel = require('../loans/acceptOrCancel')
const salesAccept = require('../sales/accept')

function getFunctions (modelName, jobName) {
  if (modelName === 'Fund') {
    switch (jobName) {
      case 'create':
        return fundsCreate
      default:
        return fundsCreate
    }
  } else if (modelName === 'Loan') {
    switch (jobName) {
      case 'request':
        return loansRequest
      case 'approve':
        return loansApprove
      case 'accept-or-cancel':
        return loansAcceptOrCancel
      default:
        return loansAcceptOrCancel
    }
  } else if (modelName === 'Sale') {
    switch (jobName) {
      case 'accept':
        return salesAccept
      default:
        return salesAccept
    }
  }
}

module.exports = {
  getFunctions
}
