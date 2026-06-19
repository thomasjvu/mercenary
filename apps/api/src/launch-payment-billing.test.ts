import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveApiKeyCaptureCostUsd } from './lib/launch-payment-billing.js';

test('resolveApiKeyCaptureCostUsd prefers settlement actuals over reserved escrow', () => {
  const cost = resolveApiKeyCaptureCostUsd({
    apiKeyBilling: { apiKeyId: 'key-1', wallet: '0xabc', reservedUsd: 5, useBalance: true },
    escrowFundingUsd: 5,
    successfulProvidersPaid: 1.25,
    maxBudgetUsd: 5,
  });
  assert.equal(cost, 1.25);
});

test('resolveApiKeyCaptureCostUsd falls back to reserved escrow without api-key billing', () => {
  const cost = resolveApiKeyCaptureCostUsd({
    escrowFundingUsd: 4,
    successfulProvidersPaid: 1.25,
    maxBudgetUsd: 4,
  });
  assert.equal(cost, 4);
});
