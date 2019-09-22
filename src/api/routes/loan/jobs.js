const asyncHandler = require('express-async-handler')

function defineJobsRouter (router) {
  if (process.env.NODE_ENV === 'test') {
    router.post('/cancel_jobs', asyncHandler(async (req, res, next) => {
      const agenda = req.app.get('agenda')

      const numRemoved = await agenda.purge()

      res.json({ removed: numRemoved })
    }))
  }
}

module.exports = defineJobsRouter
