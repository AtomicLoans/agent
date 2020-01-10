const axios = require('axios');

const BASE_URL = 'https://api.sendgrid.com/v3';
const MAIL_SEND_ENDPOINT = '/mail/send';

function defineMailerJobs(agenda) {
  agenda.define('mail-collateral-locked', async (job, done) => {
    const { data } = job.attrs;
    const { emails, amount, asset } = data;

    const subject = `Your loan has been approved. ${amount} ${asset.toUpperCase()} is available to be withdrawn!`;
    const templateId = process.env.SENDGRID_COLLATERAL_LOCKED_TEMPLATE_ID
    
    sendEmail(emails, subject, data, templateId);

    done();
  });

  agenda.define('mail-loan-cancelled', async (job, done) => {
    const { data } = job.attrs;
    const { emails } = data;

    const subject = `Your loan has been cancelled.`;
    const templateId = process.env.SENDGRID_LOAN_CANCELLED_TEMPLATE_ID
    
    sendEmail(emails, subject, data, templateId);

    done();
  });
}

function sendEmail(emails, subject, data, templateId) {
  const client = getHTTPClient();
  client({
    method: 'post',
    url: MAIL_SEND_ENDPOINT,
    data: {
      personalizations: [
        {
          to: emails.map(({ email }) => ({ email })),
          dynamic_template_data: {
            subject,
            ...data
          }
        }
      ],
      from: {
        email: 'support@atomicloans.io',
        name: 'Atomic Loans'
      },
      asm: {
        group_id: parseInt(process.env.SENDGRID_UNSUBSCRIBE_ID)
      },
      template_id: templateId
    }
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