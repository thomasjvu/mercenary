/**
 * Payment rails for Boss Raid.
 *
 * Production target: Robinhood Chain + USDG (Marian x402 facilitator).
 * Base USDC remains available for local/CI legacy profiles only.
 */

/** Robinhood Chain mainnet (CAIP-2). */
export const ROBINHOOD_CHAIN_CAIP2 = 'eip155:4663';
/** Robinhood Chain testnet (CAIP-2). */
export const ROBINHOOD_CHAIN_TESTNET_CAIP2 = 'eip155:46630';
/** Numeric chain id for RH mainnet. */
export const ROBINHOOD_CHAIN_ID = 4663;
/** Numeric chain id for RH testnet. */
export const ROBINHOOD_CHAIN_TESTNET_ID = 46630;

/** Paxos Global Dollar (USDG) on Robinhood Chain mainnet. */
export const ROBINHOOD_USDG_ADDRESS = '0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168';
export const ROBINHOOD_USDG_DECIMALS = 6;
/** EIP-712 domain name used by Marian / EIP-3009. */
export const ROBINHOOD_USDG_EIP712_NAME = 'Global Dollar';
export const ROBINHOOD_USDG_EIP712_VERSION = '1';
export const ROBINHOOD_USDG_SYMBOL = 'USDG';

/** Base mainnet / sepolia CAIP-2 (legacy CI / optional). */
export const BASE_MAINNET_CAIP2 = 'eip155:8453';
export const BASE_SEPOLIA_CAIP2 = 'eip155:84532';
export const BASE_USDC_MAINNET = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const BASE_USDC_SEPOLIA = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

export type BuiltInPaymentAsset = {
  asset: string;
  extra: {
    name: string;
    version: string;
  };
};

/** Built-in token metadata by CAIP-2 network for symbol shortcuts (`usdg` / `usdc`). */
export const X402_BUILTIN_ASSETS: Record<string, Record<string, BuiltInPaymentAsset>> = {
  [ROBINHOOD_CHAIN_CAIP2]: {
    usdg: {
      asset: ROBINHOOD_USDG_ADDRESS,
      extra: {
        name: ROBINHOOD_USDG_EIP712_NAME,
        version: ROBINHOOD_USDG_EIP712_VERSION,
      },
    },
  },
  [BASE_MAINNET_CAIP2]: {
    usdc: {
      asset: BASE_USDC_MAINNET,
      extra: {
        name: 'USD Coin',
        version: '2',
      },
    },
  },
  [BASE_SEPOLIA_CAIP2]: {
    usdc: {
      asset: BASE_USDC_SEPOLIA,
      extra: {
        name: 'USDC',
        version: '2',
      },
    },
  },
};
