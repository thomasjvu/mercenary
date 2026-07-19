import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveApiKeyCaptureCostUsd } from './lib/launch-payment-billing.js';

const apiKeyBilling = {
  apiKeyId: 'key-1',
  wallet: '0xabc',
  reservedUsd: 5,
  useBalance: true,
};

test('resolveApiKeyCaptureCostUsd prefers settlement actuals over reserved escrow', () => {
  const cost = resolveApiKeyCaptureCostUsd({
    apiKeyBilling,
    escrowFundingUsd: 5,
    successfulProvidersPaid: 1.25,
    maxBudgetUsd: 5,
  });
  assert.equal(cost, 1.25);
});

test('resolveApiKeyCaptureCostUsd zero successful providers captures 0 (full refund)', () => {
  const cost = resolveApiKeyCaptureCostUsd({
    apiKeyBilling,
    escrowFundingUsd: 5,
    successfulProvidersPaid: 0,
    maxBudgetUsd: 5,
  });
  assert.equal(cost, 0);
});

test('resolveApiKeyCaptureCostUsd missing settlement does not keep full reserved for api-key', () => {
  const cost = resolveApiKeyCaptureCostUsd({
    apiKeyBilling,
    escrowFundingUsd: 5,
    maxBudgetUsd: 5,
  });
  assert.equal(cost, 0);
});

test('resolveApiKeyCaptureCostUsd caps actual above reserved', () => {
  const cost = resolveApiKeyCaptureCostUsd({
    apiKeyBilling,
    escrowFundingUsd: 2,
    successfulProvidersPaid: 9,
    maxBudgetUsd: 5,
  });
  assert.equal(cost, 2);
});

test('resolveApiKeyCaptureCostUsd falls back to reserved escrow without api-key billing', () => {
  const cost = resolveApiKeyCaptureCostUsd({
    escrowFundingUsd: 4,
    successfulProvidersPaid: 1.25,
    maxBudgetUsd: 4,
  });
  assert.equal(cost, 4);
});
