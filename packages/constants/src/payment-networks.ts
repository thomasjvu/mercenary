/**
 * Payment rails for Boss Raid.
 *
 * Single production rail: Robinhood Chain + USDG (Marian x402 facilitator).
 * Base USDC is no longer a first-class or CI default.
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

export type BuiltInPaymentAsset = {
  asset: string;
  extra: {
    name: string;
    version: string;
  };
};

/** Built-in token metadata by CAIP-2 network for symbol shortcuts (`usdg`). */
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
  [ROBINHOOD_CHAIN_TESTNET_CAIP2]: {
    usdg: {
      asset: ROBINHOOD_USDG_ADDRESS,
      extra: {
        name: ROBINHOOD_USDG_EIP712_NAME,
        version: ROBINHOOD_USDG_EIP712_VERSION,
      },
    },
  },
};

/** True when CAIP-2 network is Robinhood mainnet or testnet. */
export function isRobinhoodPaymentNetwork(network: string | undefined): boolean {
  if (!network) {
    return false;
  }
  return (
    network === ROBINHOOD_CHAIN_CAIP2 ||
    network === ROBINHOOD_CHAIN_TESTNET_CAIP2 ||
    network.startsWith('eip155:4663')
  );
}
