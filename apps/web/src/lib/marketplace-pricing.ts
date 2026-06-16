import type { InferenceMarket } from '../api/marketplace.js';
import { formatUsd } from '@bossraid/proof-ui';

export function resolveMarketBaseInputPer1mUsd(market: InferenceMarket): number | null {
  return market.pricing.pricePer1mInputTokensUsd;
}

export function resolveMarketBaseOutputPer1mUsd(market: InferenceMarket): number | null {
  return market.pricing.pricePer1mOutputTokensUsd;
}

export function formatPer1mTokenPrice(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return '—';
  }

  const digits = value < 1 ? 3 : value < 10 ? 2 : 2;
  return formatUsd(value, digits);
}
