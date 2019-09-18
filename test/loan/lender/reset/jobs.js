const { sleep } = require('@liquality/utils')
const { cancelJobs } = require('../../loanCommon')

describe('Cancel all jobs', () => {
  it('should cancel all jobs', async () => {
    await cancelJobs()
    await sleep(2000)
  })
})
