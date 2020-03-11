const { getEmail } = require('./models')
const { isArbiter } = require('../../../utils/env')

module.exports = agenda => ({
  notify: async (addressEmail, event, data) => {
    if (!isArbiter()) return
    console.log(addressEmail, event, data)
    const email = await getEmail(addressEmail)
    if (!email) return

    agenda.now(`mail-${event}`, { emails: [email], ...data })
  }
})
