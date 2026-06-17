import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BASE_CHAIN_ID,
  DEFAULT_SUBSCRIPTION_PERIOD_SECONDS,
  DEFAULT_WEEKLY_BUDGET_USD,
  resolveDelegationManager,
} from './config.js';

test('resolveDelegationManager prefers explicit override', () => {
  const override = '0x1111111111111111111111111111111111111111';
  assert.equal(resolveDelegationManager(override), override);
});

test('resolveDelegationManager reads env when override is absent', () => {
  const previous = process.env.BOSSRAID_DELEGATION_MANAGER_ADDRESS;
  process.env.BOSSRAID_DELEGATION_MANAGER_ADDRESS = '0x2222222222222222222222222222222222222222';
  try {
    assert.equal(resolveDelegationManager(), '0x2222222222222222222222222222222222222222');
  } finally {
    if (previous === undefined) {
      delete process.env.BOSSRAID_DELEGATION_MANAGER_ADDRESS;
    } else {
      process.env.BOSSRAID_DELEGATION_MANAGER_ADDRESS = previous;
    }
  }
});

test('smart-pay defaults expose expected chain and budget constants', () => {
  assert.equal(BASE_CHAIN_ID, 8453);
  assert.equal(DEFAULT_WEEKLY_BUDGET_USD, 10);
  assert.equal(DEFAULT_SUBSCRIPTION_PERIOD_SECONDS, 604_800);
});
