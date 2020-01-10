const { getEmails} = require('./models');
const { isArbiter } = require('../../../utils/env')

module.exports = agenda => ({
  notify: async (ethAddress, event, data) => {
    if (!isArbiter()) return;
    console.log(ethAddress, event, data)
    const emails = await getEmails(ethAddress);
    if (!emails || emails.length == 0) return;

    agenda.now(`mail-${event}`, { emails: [...emails], ...data });
  }
});
