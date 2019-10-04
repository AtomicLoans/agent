const asyncHandler = require('express-async-handler')

const Loan = require('../../../../models/Loan')

function defineLoansRouter (router) {
  router.get('/loans', asyncHandler(async (req, res) => {
    const result = await Loan.find().exec()

    res.json(result.map(r => r.json()))
  }))
}

module.exports = defineLoansRouter
