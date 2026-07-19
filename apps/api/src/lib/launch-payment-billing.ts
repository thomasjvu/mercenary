import type { ApiKeyBillingContext } from '../handlers/payment.js';

/**
 * Resolve how much of an API-key launch hold to keep after work completes.
 *
 * Policy (closed-loop money protection):
 * - Buyer pays only for successful provider payouts (capped by reserved escrow).
 * - Zero successful providers → capture **0** (full hold release / refund).
 * - Missing settlement amount with API-key billing → **0** (do not keep full reserve as silent revenue).
 * - Non-API-key paths still use escrow funding / max budget for charge construction.
 */
export function resolveApiKeyCaptureCostUsd(input: {
  apiKeyBilling?: ApiKeyBillingContext;
  escrowFundingUsd?: number;
  successfulProvidersPaid?: number;
  maxBudgetUsd: number;
}): number {
  const reserved = input.escrowFundingUsd ?? input.maxBudgetUsd;
  const hasPaidAmount =
    typeof input.successfulProvidersPaid === 'number' &&
    Number.isFinite(input.successfulProvidersPaid);

  if (input.apiKeyBilling) {
    if (hasPaidAmount) {
      // Includes 0 → full release of hold via capture/release path.
      return Math.min(Math.max(0, input.successfulProvidersPaid as number), reserved);
    }
    // Settlement actual unknown: prefer refund over keeping full reserved charge.
    return 0;
  }

  if (hasPaidAmount && (input.successfulProvidersPaid as number) > 0) {
    return input.escrowFundingUsd ?? (input.successfulProvidersPaid as number);
  }

  return input.escrowFundingUsd ?? input.maxBudgetUsd;
}
