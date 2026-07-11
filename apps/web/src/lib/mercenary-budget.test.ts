import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMercenaryBudgetPreflightError,
  clampMercenaryBudgetUsd,
  formatMercenaryBudgetCap,
  resolveMercenaryBudgetUsd,
} from './mercenary-budget.js';

test('clampMercenaryBudgetUsd respects host max', () => {
  assert.equal(clampMercenaryBudgetUsd(12, 5), 5);
  assert.equal(clampMercenaryBudgetUsd(3, 5), 3);
  assert.equal(clampMercenaryBudgetUsd(0.5, 5), 1);
});

test('clampMercenaryBudgetUsd leaves budget unchanged without host max', () => {
  assert.equal(clampMercenaryBudgetUsd(12), 12);
});

test('resolveMercenaryBudgetUsd prefers host max over default', () => {
  assert.equal(resolveMercenaryBudgetUsd(undefined, 5), 5);
  assert.equal(resolveMercenaryBudgetUsd(12, 5), 5);
});

test('formatMercenaryBudgetCap renders host limit', () => {
  assert.equal(formatMercenaryBudgetCap(5), 'Public beta max $5.00 per request');
});

test('buildMercenaryBudgetPreflightError explains mismatch', () => {
  assert.equal(
    buildMercenaryBudgetPreflightError(12, 5),
    'Per-raid budget is $12.00 but this host caps requests at $5.00. Lower Budget USD and try again.'
  );
});
