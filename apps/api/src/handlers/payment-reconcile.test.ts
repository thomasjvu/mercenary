import assert from 'node:assert/strict';
import test from 'node:test';
import { createApiControlState } from '../control-state.js';
import { createApiMetrics } from '../lib/metrics.js';
import { createAuthHandlers } from './auth.js';
import { createManaBillingHandlers } from './billing-mana.js';
import { createPaymentHandlers } from './payment.js';
import type { ApiContext } from '../api-context.js';
import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import { createSpawnInput } from '@bossraid/test-fixtures';

test('reconcileLaunchPayment releases api-key reservation without settled payment', async () => {
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });
  const orchestrator = {
    getRaidLaunchReservation: () => undefined,
  } as unknown as BossRaidOrchestrator;

  const ctx = {
    controlState,
    orchestrator,
    apiMetrics: createApiMetrics(),
    env: process.env,
  } as unknown as ApiContext;

  const auth = createAuthHandlers(ctx);
  const manaBilling = createManaBillingHandlers(ctx);
  const payment = createPaymentHandlers(ctx, auth, manaBilling);

  const account = controlState.ensurePublicAccount('0xBuyer00000000000000000000000000000003');
  controlState.creditBuyerBalance(account.wallet, 2);
  const apiKey = controlState.createBuyerApiKey({
    wallet: account.wallet,
    name: 'reconcile-test',
    keyHash: 'hash_reconcile',
    prefix: 'br_rec',
  });
  const reservation = controlState.reserveBuyerApiKeyLaunch(apiKey.id, account.wallet, 2);
  assert.ok(reservation);

  await payment.reconcileLaunchPayment({
    route: 'chat',
    request: { headers: {} } as never,
    raidRequest: createSpawnInput(),
    launchPayment: {
      apiKeyBilling: reservation!,
    },
    reason: 'spawn_failed',
    raidId: 'raid-1',
  });

  const accountAfter = controlState.readPublicAccount(account.wallet);
  assert.equal(accountAfter?.balanceUsd, 2);
});

test('reconcileLaunchPayment skips x402 refund when refundX402 is false', async () => {
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });
  const orchestrator = {
    getRaidLaunchReservation: () => ({
      id: 'reservation-1',
      sanitized: { constraints: { maxBudgetUsd: 2 } },
    }),
  } as unknown as BossRaidOrchestrator;

  let refundAttempts = 0;
  const ctx = {
    controlState,
    orchestrator,
    apiMetrics: createApiMetrics(),
    env: {
      ...process.env,
      BOSSRAID_X402_ENABLED: 'true',
      BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.test/x402',
      BOSSRAID_X402_PAY_TO: '0xabc',
    },
  } as unknown as ApiContext;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes('facilitator.test')) {
      refundAttempts += 1;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return originalFetch(input);
  };

  try {
    const auth = createAuthHandlers(ctx);
    const manaBilling = createManaBillingHandlers(ctx);
    const payment = createPaymentHandlers(ctx, auth, manaBilling);

    await payment.reconcileLaunchPayment({
      route: 'chat',
      request: {
        headers: { 'payment-signature': 'sig-test' },
      } as never,
      raidRequest: createSpawnInput(),
      launchPayment: {
        settlement: { success: true, transaction: '0xsettled' },
        reservationId: 'reservation-1',
        requestKey: 'request-key',
      },
      reason: 'billing_capture_failed',
      refundX402: false,
    });

    assert.equal(refundAttempts, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
