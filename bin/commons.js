const program = require('commander')
const fs = require('fs')
const path = require('path')
const { generateMnemonic } = require('bip39')

const CONFIG_ENV_MAP = {
  port: 'PORT',
  mongo: 'MONGODB_URI',
  btcRpc: 'BTC_RPC',
  btcUser: 'BTC_USER',
  btcPass: 'BTC_PASS',
  btcApi: 'BTC_API',
  ethRpc: 'ETH_RPC',
  ethUser: 'ETH_USER',
  ethPass: 'ETH_PASS',
  metamask: 'METAMASK_ETH_ADDRESS',
  mnemonic: 'MNEMONIC',
  network: 'NETWORK'
}

function rewriteEnv (envFile, key, value) {
  if (fs.existsSync(path.resolve(process.cwd(), envFile))) {
    const env = fs.readFileSync(path.resolve(process.cwd(), envFile), 'utf-8')
    const regex = new RegExp(`${key}=("(.*?)"|([0-9a-zA-Z])\\w+)`, 'g')
    const newEnv = env.replace(regex, `${key}=${value}`)
    fs.writeFileSync(path.resolve(process.cwd(), envFile), newEnv, 'utf-8')
  } else {
    const newEnv = `${key}=${value}`
    fs.writeFileSync(path.resolve(process.cwd(), envFile), newEnv, 'utf-8')
  }
}

function getEnvValue (envFile, key) {
  const env = fs.readFileSync(path.resolve(process.cwd(), envFile), 'utf-8')
  const regex = new RegExp(`${key}=("(.*?)"|([0-9a-zA-Z])\\w+)`, 'g')
  const value = env.match(regex)
  return value.toString().replace(`${key}=`, '').replace('"', '').replace('"', '')
}

module.exports.loadVariables = (config = {}) => {
  program
    .option('-p, --port <port>', 'Application port', config.defaultPort ? config.defaultPort : 3000)
    .option('--mongo <uri>', 'mongoDB uri', 'mongodb://localhost/agent')
    .option('--btc-rpc <url>', 'Bitcoin RPC endpoint', 'https://btc.atomicloans.io/testnet/')
    .option('--btc-user <user>', 'Bitcoin RPC user', 'atomicloans')
    .option('--btc-pass <pass>', 'Bitcoin RPC pass,', 'local321')
    .option('--btc-api <api>', 'Bitcoin API Endpoint,', 'https://blockstream.info/testnet/api')
    .option('--eth-rpc <url>', 'Ethereum RPC endpoint', 'https://kovan.infura.io/v3/f44304af9af940d2b577637ddbc2b30e')
    .option('--eth-user <user>', 'Ethereum RPC user')
    .option('--eth-pass <pass>', 'Ethereum RPC pass')
    .option('--metamask <addr>', 'Metamask Ethereum Address')
    .option('--mnemonic <string>', '12 word seed phrase')
    .option('--network <string>', 'Ethereum Network', 'kovan')

  program
    .parse(process.argv)

  Object.entries(CONFIG_ENV_MAP).forEach(([configKey, envKey]) => {
    if (!process.env[envKey]) {
      process.env[envKey] = program[configKey]
    }
  })

  console.log('process.env', process.env)

  process.env.PROCESS_TYPE = config.processType

  if (process.env.MNEMONIC !== 'undefined') {
    rewriteEnv('.env', 'MNEMONIC', `"${process.env.MNEMONIC}"`)
  } else {
    if (fs.existsSync(path.resolve(process.cwd(), '.env'))) {
      process.env.MNEMONIC = getEnvValue('.env', 'MNEMONIC')
    } else {
      const mnemonic = generateMnemonic(128)
      rewriteEnv('.env', 'MNEMONIC', `"${mnemonic}"`)
      process.env.MNEMONIC = mnemonic
    }
  }

  if (process.env.PARTY === 'arbiter') {
    if (process.env.MNEMONIC_ARBITER !== undefined) {
      rewriteEnv('.env', 'MNEMONIC_ARBITER', `"${process.env.MNEMONIC_ARBITER}"`)
    } else {
      if (fs.existsSync(path.resolve(process.cwd(), '.env'))) {
        process.env.MNEMONIC_ARBITER = getEnvValue('.env', 'MNEMONIC_ARBITER')
      } else {
        const mnemonic = generateMnemonic(128)
        rewriteEnv('.env', 'MNEMONIC_ARBITER', `"${mnemonic}"`)
        process.env.MNEMONIC_ARBITER = mnemonic
      }
    }
  }
}
