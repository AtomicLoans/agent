const Client = require('@liquality/client')
const LoanClient = require('@atomicloans/loan-client')
const { isArbiter } = require('./env')
const { contractAddresses } = require('../networks/index')

const {
  BTC_RPC, BTC_USER, BTC_PASS,
  ETH_RPC, ETH_USER, ETH_PASS,
  NETWORK, MNEMONIC, MNEMONIC_ARBITER
} = process.env

const BitcoinRpcProvider = require('@liquality/bitcoin-rpc-provider')
const BitcoinJsWalletProvider = require('@liquality/bitcoin-js-wallet-provider')
const BitcoinSwapProvider = require('@liquality/bitcoin-swap-provider')
const BitcoinCollateralProvider = require('@atomicloans/bitcoin-collateral-provider')
const BitcoinCollateralSwapProvider = require('@atomicloans/bitcoin-collateral-swap-provider')
const BitcoinNetworks = require('@liquality/bitcoin-networks')

const EthereumRpcProvider = require('@liquality/ethereum-rpc-provider')
const EthereumSwapProvider = require('@liquality/ethereum-swap-provider')
const EthereumErc20Provider = require('@liquality/ethereum-erc20-provider')

const addresses = contractAddresses(NETWORK)

const BTC = new Client()
const BTCLoan = new LoanClient(BTC)
BTC.loan = BTCLoan
BTC.addProvider(new BitcoinRpcProvider(BTC_RPC, BTC_USER, BTC_PASS))
BTC.addProvider(new BitcoinJsWalletProvider(BitcoinNetworks.bitcoin_regtest, BTC_RPC, BTC_USER, BTC_PASS, isArbiter() ? MNEMONIC_ARBITER : MNEMONIC, 'bech32'))
BTC.addProvider(new BitcoinSwapProvider({ network: BitcoinNetworks.bitcoin_regtest }))
BTC.loan.addProvider(new BitcoinCollateralProvider({ network: BitcoinNetworks.bitcoin_regtest }))
BTC.loan.addProvider(new BitcoinCollateralSwapProvider({ network: BitcoinNetworks.bitcoin_regtest }))

const ETH = new Client()
ETH.addProvider(new EthereumRpcProvider(ETH_RPC, ETH_USER, ETH_PASS))
ETH.addProvider(new EthereumSwapProvider())

const DAI = new Client()
DAI.addProvider(new EthereumRpcProvider(ETH_RPC, ETH_USER, ETH_PASS))
DAI.addProvider(new EthereumErc20Provider(addresses.DAI))

const USDC = new Client()
USDC.addProvider(new EthereumRpcProvider(ETH_RPC, ETH_USER, ETH_PASS))
USDC.addProvider(new EthereumErc20Provider(addresses.USDC))

module.exports = {
  BTC,
  ETH,
  DAI,
  USDC
}
