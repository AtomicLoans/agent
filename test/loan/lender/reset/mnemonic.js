const { generateMnemonic } = require('bip39')
const { rewriteEnv } = require('../../../common')

describe('Reset Mnemonic', () => {
  it('should generate Mnemonic and insert into .env', async () => {
    rewriteEnv('.env', 'LENDER_MNEMONIC', `"${generateMnemonic(128)}"`)
  })
})
