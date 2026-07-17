import { ROBINHOOD_CHAIN_ID, ROBINHOOD_USDG_ADDRESS } from '@bossraid/constants';

/** Production settlement / x402 chain (Robinhood). */
export const ROBINHOOD_CHAIN_ID_NUM = ROBINHOOD_CHAIN_ID;
export const USDG_ROBINHOOD = ROBINHOOD_USDG_ADDRESS;

/** @deprecated Use ROBINHOOD_CHAIN_ID_NUM — kept as alias for callers mid-migration. */
export const BASE_CHAIN_ID = ROBINHOOD_CHAIN_ID;
/** @deprecated Robinhood-only rail; sepolia alias removed. */
export const BASE_SEPOLIA_CHAIN_ID = ROBINHOOD_CHAIN_ID;

/** @deprecated */
export const USDC_BASE = ROBINHOOD_USDG_ADDRESS;
/** @deprecated */
export const USDC_BASE_SEPOLIA = ROBINHOOD_USDG_ADDRESS;

export const DEFAULT_WEEKLY_BUDGET_USD = 10;
export const DEFAULT_SUBSCRIPTION_PERIOD_SECONDS = 604_800;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export function resolveDelegationManager(override?: `0x${string}`): `0x${string}` {
  if (override) {
    return override;
  }

  const fromEnv =
    typeof process !== 'undefined' ? process.env.BOSSRAID_DELEGATION_MANAGER_ADDRESS : undefined;
  if (fromEnv && /^0x[a-fA-F0-9]{40}$/.test(fromEnv)) {
    return fromEnv as `0x${string}`;
  }

  return ZERO_ADDRESS;
}
