const asyncHandler = require('express-async-handler')

const AddressEmail = require('../../../../models/AddressEmail')
const Email = require('../../../../models/Email')

function defineMailerRouter (router) {
  router.post(
    '/mailer',
    asyncHandler(async (req, res) => {
      const {
        body: { address, email }
      } = req
      const emailRecord = await Email.findOneAndUpdate({ email }, {}, { upsert: true, new: true }).exec()

      await AddressEmail.findOneAndUpdate({ address }, { $addToSet: { emails: emailRecord } }, { upsert: true, new: true }).exec()

      res.json({ message: 'success' })
    })
  )

  router.get(
    '/mailer/emails/:address/set',
    asyncHandler(async (req, res) => {
      const { params: { address } } = req
      const exists = await AddressEmail.exists({ address })

      return exists
    })
  )
}

module.exports = defineMailerRouter
