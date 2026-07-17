import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_SUBSCRIPTION_PERIOD_SECONDS,
  DEFAULT_WEEKLY_BUDGET_USD,
  ROBINHOOD_CHAIN_ID_NUM,
  USDG_ROBINHOOD,
} from './config.js';

test('smart-pay defaults use Robinhood USDG rail', () => {
  assert.equal(ROBINHOOD_CHAIN_ID_NUM, 4663);
  assert.equal(USDG_ROBINHOOD.toLowerCase().startsWith('0x'), true);
  assert.equal(DEFAULT_WEEKLY_BUDGET_USD, 10);
  assert.equal(DEFAULT_SUBSCRIPTION_PERIOD_SECONDS, 604_800);
});
