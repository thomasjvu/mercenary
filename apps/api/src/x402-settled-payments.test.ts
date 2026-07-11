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

test('tryClaimX402SettledPaymentAndCredit atomically claims and credits balance', () => {
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });
  const wallet = '0xBuyer00000000000000000000000000000004';
  const fingerprint = buildX402SettlementFingerprint({
    settlementTx: '0xabc789',
  });
  assert.ok(fingerprint);

  const first = controlState.tryClaimX402SettledPaymentAndCredit({
    fingerprint: fingerprint!,
    wallet,
    route: 'balance',
    amountUsd: 4,
    createdAt: new Date().toISOString(),
  });
  assert.equal(first.claimed, true);
  assert.equal(first.balanceUsd, 4);
  assert.equal(controlState.hasX402SettledPayment(fingerprint!), true);

  const second = controlState.tryClaimX402SettledPaymentAndCredit({
    fingerprint: fingerprint!,
    wallet,
    route: 'balance',
    amountUsd: 4,
    createdAt: new Date().toISOString(),
  });
  assert.equal(second.claimed, false);
  assert.equal(second.balanceUsd, 4);
});

test('tryClaimX402SettledPayment rejects duplicate fingerprints atomically', () => {
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });
  const fingerprint = buildX402SettlementFingerprint({
    settlementTx: '0xdef456',
  });
  assert.ok(fingerprint);
  const entry = {
    fingerprint: fingerprint!,
    wallet: '0xposter',
    route: 'balance' as const,
    amountUsd: 3,
    createdAt: new Date().toISOString(),
  };
  assert.equal(controlState.tryClaimX402SettledPayment(entry), true);
  assert.equal(controlState.tryClaimX402SettledPayment(entry), false);
});

test('settled payment fingerprints expire by TTL not a short LRU', async () => {
  const { pruneX402SettledPayments } = await import('./control-state/x402-settled-payments.js');
  const now = Date.now();
  const pruned = pruneX402SettledPayments(
    [
      {
        fingerprint: 'tx:old',
        wallet: '0x1',
        route: 'balance',
        amountUsd: 1,
        createdAt: new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        fingerprint: 'tx:fresh',
        wallet: '0x1',
        route: 'balance',
        amountUsd: 1,
        createdAt: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    now
  );
  assert.deepEqual(
    pruned.map((entry) => entry.fingerprint),
    ['tx:fresh']
  );
});
