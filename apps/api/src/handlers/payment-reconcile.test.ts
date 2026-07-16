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
import { installMockX402Facilitator } from '../test/helpers.js';

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

test('reconcileLaunchPayment releases api-key reservation for raid route failures', async () => {
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

  const account = controlState.ensurePublicAccount('0xBuyer00000000000000000000000000000004');
  controlState.creditBuyerBalance(account.wallet, 3);
  const apiKey = controlState.createBuyerApiKey({
    wallet: account.wallet,
    name: 'raid-reconcile',
    keyHash: 'hash_raid_reconcile',
    prefix: 'br_rr',
  });
  const reservation = controlState.reserveBuyerApiKeyLaunch(apiKey.id, account.wallet, 2);
  assert.ok(reservation);

  await payment.reconcileLaunchPayment({
    route: 'raid',
    request: { headers: {} } as never,
    raidRequest: createSpawnInput(),
    launchPayment: {
      apiKeyBilling: reservation!,
    },
    reason: 'terminal_wait_timeout',
    raidId: 'raid-reconcile-1',
  });

  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 3);
});

test('captureApiKeyBilling failure then releaseLaunchPaymentHold credits prepaid balance once', async () => {
  // Mirrors streaming capture failure: capture releases hold then throws; pipeline onFailure
  // may call releaseLaunchPaymentHold again. Balance must return only once.
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

  const account = controlState.ensurePublicAccount('0xBuyer00000000000000000000000000000005');
  controlState.creditBuyerBalance(account.wallet, 2);
  const apiKey = controlState.createBuyerApiKey({
    wallet: account.wallet,
    name: 'double-release',
    keyHash: 'hash_double_release',
    prefix: 'br_dr',
  });
  const reservation = controlState.reserveBuyerApiKeyLaunch(apiKey.id, account.wallet, 2);
  assert.ok(reservation);
  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 0);

  // Force a clean capture miss (no partial ledger mutation) — same as capture returning false.
  const originalCapture = controlState.captureBuyerApiKeyBillingWithPurchase.bind(controlState);
  controlState.captureBuyerApiKeyBillingWithPurchase = () => false;

  try {
    assert.throws(
      () =>
        payment.captureApiKeyBilling({
          apiKeyBilling: reservation!,
          actualCostUsd: 1,
          route: 'chat',
          raidId: 'raid-double-release',
          modelId: 'mercenary-v1',
        }),
      (error: unknown) => error instanceof Error && error.message.includes('launch hold released')
    );

    assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 2);
    assert.equal(reservation!.released, true);
    assert.equal(controlState.listBuyerApiKeys(account.wallet)[0]?.spentUsd, 0);

    // Pipeline-style second release must not double-credit.
    await payment.releaseLaunchPaymentHold({
      launchPayment: { apiKeyBilling: reservation! },
    });
    assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 2);
    assert.equal(controlState.listBuyerApiKeys(account.wallet)[0]?.spentUsd, 0);
  } finally {
    controlState.captureBuyerApiKeyBillingWithPurchase = originalCapture;
  }
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

test('reconcileLaunchPayment refunds x402 settlement when spawn fails', async () => {
  const facilitator = installMockX402Facilitator();
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'true',
    BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.test/x402',
    BOSSRAID_X402_PAY_TO: '0xabc',
  });
  const orchestrator = {
    getRaidLaunchReservation: () => ({
      id: 'reservation-refund-1',
      sanitized: createSpawnInput(),
    }),
  } as unknown as BossRaidOrchestrator;

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

  try {
    const auth = createAuthHandlers(ctx);
    const manaBilling = createManaBillingHandlers(ctx);
    const payment = createPaymentHandlers(ctx, auth, manaBilling);

    await payment.reconcileLaunchPayment({
      route: 'chat',
      request: {
        headers: {
          'payment-signature': Buffer.from(JSON.stringify({ proof: 'sig' })).toString('base64'),
        },
      } as never,
      raidRequest: createSpawnInput(),
      launchPayment: {
        settlement: { success: true, transaction: '0xsettled' },
        reservationId: 'reservation-refund-1',
        requestKey: 'request-key',
      },
      reason: 'spawn_failed',
      raidId: 'raid-refund-1',
    });

    assert.ok(facilitator.requests.some((request) => request.url.endsWith('/refund')));
  } finally {
    facilitator.restore();
  }
});
