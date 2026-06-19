import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiControlState } from './control-state.js';
import { buildX402SettlementFingerprint } from './control-state/x402-settled-payments.js';

test('x402 settled payment fingerprints deduplicate balance credits', () => {
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });
  const fingerprint = buildX402SettlementFingerprint({
    settlementTx: '0xabc123',
  });
  assert.ok(fingerprint);
  assert.equal(controlState.hasX402SettledPayment(fingerprint!), false);
  controlState.recordX402SettledPayment({
    fingerprint: fingerprint!,
    wallet: '0xposter',
    route: 'balance',
    amountUsd: 5,
    createdAt: new Date().toISOString(),
  });
  assert.equal(controlState.hasX402SettledPayment(fingerprint!), true);
});
