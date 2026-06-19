import type { ApiKeyBillingContext } from '../handlers/payment.js';

export function resolveApiKeyCaptureCostUsd(input: {
  apiKeyBilling?: ApiKeyBillingContext;
  escrowFundingUsd?: number;
  successfulProvidersPaid?: number;
  maxBudgetUsd: number;
}): number {
  const actualSettlement =
    typeof input.successfulProvidersPaid === 'number' && input.successfulProvidersPaid > 0
      ? input.successfulProvidersPaid
      : undefined;

  if (input.apiKeyBilling && actualSettlement != null) {
    const reserved = input.escrowFundingUsd ?? input.maxBudgetUsd;
    return Math.min(actualSettlement, reserved);
  }

  return input.escrowFundingUsd ?? actualSettlement ?? input.maxBudgetUsd;
}
