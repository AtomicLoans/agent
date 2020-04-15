const asyncHandler = require('express-async-handler')

const { verifyTimestampedSignatureUsingExpected } = require('../../../../utils/signatures')
const AddressEmail = require('../../../../models/AddressEmail')

function defineMailerRouter (router) {
  router.post(
    '/mailer',
    asyncHandler(async (req, res, next) => {
      const {
        body: { address, email }
      } = req

      const exists = await AddressEmail.exists({ address })
      if (exists) {
        return next(res.createError(401, 'Email already exists. Update through the settings.'))
      }

      await AddressEmail.findOneAndUpdate({ address }, { email }, { upsert: true, new: true }).exec()

      res.json({ message: 'success' })
    })
  )

  router.put(
    '/mailer/emails/:address',
    asyncHandler(async (req, res, next) => {
      const {
        body: { email, enabled },
        params: { address }
      } = req

      const signature = req.header('X-Signature')
      const timestamp = parseInt(req.header('X-Timestamp'))

      try {
        verifyTimestampedSignatureUsingExpected(signature, `Update email preferences (${enabled}) (${email}) (${timestamp})`, timestamp, address)
      } catch (e) {
        return next(res.createError(401, e.message))
      }

      await AddressEmail.findOneAndUpdate({ address }, { email, enabled }, { upsert: true }).exec()

      res.json({ message: 'success' })
    })
  )

  router.get(
    '/mailer/emails/:address',
    asyncHandler(async (req, res, next) => {
      const { params: { address } } = req

      const signature = req.header('X-Signature')
      const timestamp = parseInt(req.header('X-Timestamp'))

      try {
        verifyTimestampedSignatureUsingExpected(signature, `Retrieve email preferences (${timestamp})`, timestamp, address)
      } catch (e) {
        return next(res.createError(401, e.message))
      }

      const data = await AddressEmail.findOne({ address }).exec()
      if (!data) {
        return res.json({})
      }

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
