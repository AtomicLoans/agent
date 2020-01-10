const axios = require('axios');

const BASE_URL = 'https://api.sendgrid.com/v3';
const MAIL_SEND_ENDPOINT = '/mail/send';

function defineMailerJobs(agenda) {
  agenda.define('mail-collateral-locked', async (job, done) => {
    const client = getHTTPClient();

    const { data } = job.attrs;
    const { emails, amount, asset } = data;

    client({
      method: 'post',
      url: MAIL_SEND_ENDPOINT,
      data: {
        personalizations: [
          {
            to: emails.map(({email}) => ({email})),
            dynamic_template_data: {
              subject: `Your loan has been approved. ${amount} ${asset.toUpperCase()} is available to be withdrawn!`,
              ...data
            }
          }
        ],
        from: {
          email: 'support@atomicloans.io',
          name: 'Atomic Loans'
        },
        asm: {
            group_id: process.env.SENDGRID_UNSUBSCRIBE_ID
        },
        template_id: process.env.SENDGRID_COLLATERAL_LOCKED_TEMPLATE_ID
      }
    });

    done();
  });
}

function getHTTPClient() {
  const instance = axios.create({
    baseURL: BASE_URL
  });

  instance.defaults.headers.common[
    'Authorization'
  ] = `Bearer ${process.env.SENDGRID_KEY}`;
  instance.defaults.headers.post['Content-Type'] = 'application/json';

  return instance;
}

module.exports = {
  defineMailerJobs
};
