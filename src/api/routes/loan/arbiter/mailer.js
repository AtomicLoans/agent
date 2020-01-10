const asyncHandler = require('express-async-handler');

const EthAddress = require('../../../../models/EthAddress');
const Email = require('../../../../models/Email');

function defineMailerRouter(router) {
  router.post(
    '/mailer',
    asyncHandler(async (req, res) => {
      const {
        body: { address, email }
      } = req;
      const emailRecord = await Email.findOneAndUpdate({email}, {}, {upsert: true, new: true}).exec()

      await EthAddress.findOneAndUpdate({address}, {$addToSet: {emails: emailRecord}}, {upsert: true, new: true}).exec()

      res.json({message: 'success'})
    })
  );
}

module.exports = defineMailerRouter;
