const axios = require('axios')

const BASE_URL = 'https://api.sendgrid.com/v3'
const MAIL_SEND_ENDPOINT = '/mail/send'

function defineMailerJobs (agenda) {
  agenda.define('mail-collateral-locked', async (job, done) => {
    const { data } = job.attrs
    const { emails, amount, asset } = data

    const subject = `Your loan has been approved. ${amount} ${asset.toUpperCase()} is available to be withdrawn!`
    const templateId = process.env.SENDGRID_COLLATERAL_LOCKED_TEMPLATE_ID

    sendEmail(emails, subject, data, templateId)

    done()
  })

  agenda.define('mail-loan-cancelled', async (job, done) => {
    const { data } = job.attrs
    const { emails } = data

    const subject = `Your loan has been cancelled.`
    const templateId = process.env.SENDGRID_LOAN_CANCELLED_TEMPLATE_ID

    sendEmail(emails, subject, data, templateId)

    done()
  })

  agenda.define('mail-liquidated', async (job, done) => {
    const { data } = job.attrs
    const { emails } = data

    const subject = `Your loan was liquidated because the minimum collateralization was not met`
    const templateId = process.env.SENDGRID_LIQUIDATED_MIN_COLLAT_TEMPLATE_ID

    sendEmail(emails, subject, data, templateId)

    done()
  })

  agenda.define('mail-loan-accepted', async (job, done) => {
    const { data } = job.attrs;
    const { emails } = data;

    const subject = `Loan repayment accepted. Withdraw your collateral.`;
    const templateId = process.env.SENDGRID_LOAN_ACCEPTED_TEMPLATE_ID

    sendEmail(emails, subject, data, templateId);

    done();
  })

  agenda.define('mail-loan-expiring', async (job, done) => {
    const { data } = job.attrs;
    const { emails } = data;

    const subject = `Your loan is about to expire.`;
    const templateId = process.env.SENDGRID_LOAN_EXPIRING_TEMPLATE_ID

    sendEmail(emails, subject, data, templateId);

    done();
  })

  agenda.define('mail-loan-near-liquidation', async (job, done) => {
    const { data } = job.attrs;
    const { emails } = data;

    const subject = `Your loan is close to liquidation. Repay or add collateral soon.`;
    const templateId = process.env.SENDGRID_LOAN_NEAR_LIQUIDATION_TEMPLATE_ID

    sendEmail(emails, subject, data, templateId);

    done();
  })
  
}

function sendEmail (emails, subject, data, templateId) {
  const client = getHTTPClient()
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
  })
}

function getHTTPClient () {
  const instance = axios.create({
    baseURL: BASE_URL
  })

  instance.defaults.headers.common[
    'Authorization'
  ] = `Bearer ${process.env.SENDGRID_KEY}`
  instance.defaults.headers.post['Content-Type'] = 'application/json'

  return instance
}

module.exports = {
  defineMailerJobs
}
