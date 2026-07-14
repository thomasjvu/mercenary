import { readPositiveNumber } from './env.js';

/**
 * Minimum USD before an on-chain seller transfer is attempted (batch efficiency).
 * Ledger still credits every successful call below this floor.
 * Robinhood USDG default: $1 (was $0.25 for Base micro-settlement).
 */
export const DEFAULT_SETTLEMENT_MIN_PAYOUT_USD = 1;
/** Discount-inference ledger credit floor (not on-chain flush). */
export const INFERENCE_SETTLEMENT_MIN_PAYOUT_USD = 0.01;

export function readSettlementMinPayoutUsd(
  env: NodeJS.ProcessEnv = process.env,
  fallback = DEFAULT_SETTLEMENT_MIN_PAYOUT_USD
): number {
  return readPositiveNumber(env.BOSSRAID_SETTLEMENT_MIN_PAYOUT_USD, fallback);
}

export function readSettlementMode(
  env: NodeJS.ProcessEnv = process.env
): 'off' | 'file' | 'onchain' {
  const mode = env.BOSSRAID_SETTLEMENT_MODE?.trim();
  if (mode === 'onchain' || mode === 'file' || mode === 'off') {
    return mode;
  }

  return 'file';
}
