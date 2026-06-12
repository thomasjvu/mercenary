import { readPositiveNumber } from './env.js';

export const DEFAULT_SETTLEMENT_MIN_PAYOUT_USD = 0.25;
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
