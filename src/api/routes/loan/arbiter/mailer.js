const asyncHandler = require('express-async-handler')

const { verifyTimestampedSignature } = require('../../../../utils/signatures')
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
    '/mailer/emails/:address',
    asyncHandler(async (req, res, next) => {
      const { params: { address, message, timestamp } } = req
      const signature = req.header('X-Signature')

      try {
        verifyTimestampedSignature(signature, message, `Retrieve email preferences (${timestamp})`, timestamp, address)
      } catch (e) {
        return next(res.createError(401, e.message))
      }

      const data = await AddressEmail.find({ address })

      res.json(data.json())
    })
  )

  router.get(
    '/mailer/emails/:address/set',
    asyncHandler(async (req, res) => {
      const { params: { address } } = req
      const exists = await AddressEmail.exists({ address })

      res.json({ exists })
    })
  )
}

module.exports = defineMailerRouter
