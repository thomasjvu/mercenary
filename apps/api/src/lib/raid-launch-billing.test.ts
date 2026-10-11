import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import type { FastifyRequest } from 'fastify';
import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { BossRaidResultOutput, BossRaidStatusOutput } from '@bossraid/shared-types';
import { createSpawnInput } from '@bossraid/test-fixtures';
import { createApiControlState } from '../control-state.js';
import { createApiMetrics } from './metrics.js';
import { createAuthHandlers } from '../handlers/auth.js';
import { createManaBillingHandlers } from '../handlers/billing-mana.js';
import { createPaymentHandlers, type LaunchPaymentContext } from '../handlers/payment.js';
import type { ApiContext } from '../api-context.js';
import { captureRaidLaunchBilling } from './raid-launch-billing.js';

function buildTerminalOrchestrator(): BossRaidOrchestrator {
  const status: BossRaidStatusOutput = {
    raidId: 'raid-billing',
    status: 'final',
    experts: [],
    firstValidAvailable: true,
    sanitization: {
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      removedUrls: 0,
      trimmedFiles: 0,
      unsafeContentDetected: false,
      riskTier: 'safe',
      issues: [],
    },
  };
  const result: BossRaidResultOutput = {
    raidId: 'raid-billing',
    status: 'final',
    approvedSubmissions: [],
    rankedSubmissions: [],
    settlement: {
      successfulProvidersPaid: 1.25,
      escrowFundingUsd: 2,
      payoutPerSuccessfulProvider: 1.25,
      successfulProviderCount: 1,
      platformMarkupUsd: 0,
      minimumPayoutThresholdUsd: 0,
      approvedProviderCount: 1,
    },
  };

  return {
    getStatus: () => status,
    getResult: () => result,
    getRaid: () => ({ settlementExecution: { id: 'settle-1' } }),
  } as unknown as BossRaidOrchestrator;
}

function buildRunningOrchestrator(): BossRaidOrchestrator {
  const status: BossRaidStatusOutput = {
    raidId: 'raid-timeout',
    status: 'running',
    experts: [],
    firstValidAvailable: false,
    sanitization: {
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      removedUrls: 0,
      trimmedFiles: 0,
      unsafeContentDetected: false,
      riskTier: 'safe',
      issues: [],
    },
  };
  const result: BossRaidResultOutput = {
    raidId: 'raid-timeout',
    status: 'running',
    approvedSubmissions: [],
    rankedSubmissions: [],
  };

  return {
    getStatus: () => status,
    getResult: () => result,
    getRaid: () => ({ settlementExecution: { id: 'settle-1' } }),
  } as unknown as BossRaidOrchestrator;
}

function buildBillingDeps(input: {
  orchestrator: BossRaidOrchestrator;
  captureApiKeyBilling?: ReturnType<typeof createPaymentHandlers>['captureApiKeyBilling'];
  reconcileLaunchPayment?: () => Promise<void>;
}) {
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });
  const ctx = {
    controlState,
    orchestrator: input.orchestrator,
    apiMetrics: createApiMetrics(),
    env: process.env,
    chatTerminalSettleGraceMs: 25,
    settlementMode: 'file',
  } as unknown as ApiContext;

  const auth = createAuthHandlers(ctx);
  const manaBilling = createManaBillingHandlers(ctx);
  const payment = createPaymentHandlers(ctx, auth, manaBilling);

  let reconcileCalled = false;
  const captureApiKeyBilling: ReturnType<typeof createPaymentHandlers>['captureApiKeyBilling'] =
    input.captureApiKeyBilling ??
    (() => {
      payment.captureApiKeyBilling({
        apiKeyBilling: {
          apiKeyId: 'key-1',
          wallet: '0xBuyer00000000000000000000000000000001',
          reservedUsd: 2,
          useBalance: true,
        },
        actualCostUsd: 1.25,
        route: 'raid',
        raidId: 'raid-billing',
      });
    });

  return {
    controlState,
    deps: {
      ctx,
      auth,
      payment: {
        ...payment,
        captureApiKeyBilling,
        reconcileLaunchPayment: async (reconcileInput: {
          route: 'raid' | 'chat';
          request: FastifyRequest;
          raidRequest: ReturnType<typeof createSpawnInput>;
          launchPayment: LaunchPaymentContext;
          reason: string;
          raidId?: string;
          refundX402?: boolean;
        }) => {
          reconcileCalled = true;
          if (input.reconcileLaunchPayment) {
            await input.reconcileLaunchPayment();
            return;
          }
          await payment.reconcileLaunchPayment(reconcileInput);
        },
      },
    },
    wasReconcileCalled: () => reconcileCalled,
  };
}

test('captureRaidLaunchBilling does not reconcile when post-finalize capture fails', async () => {
  const accountWallet = '0xBuyer00000000000000000000000000000001';
  const { controlState, deps, wasReconcileCalled } = buildBillingDeps({
    orchestrator: buildTerminalOrchestrator(),
    captureApiKeyBilling: () => {
      throw new Error('ledger write failed');
    },
  });

  const account = controlState.ensurePublicAccount(accountWallet);
  controlState.creditBuyerBalance(account.wallet, 5);
  const apiKey = controlState.createBuyerApiKey({
    wallet: account.wallet,
    name: 'raid-billing',
    keyHash: 'hash_raid_billing',
    prefix: 'br_rb',
  });
  const reservation = controlState.reserveBuyerApiKeyLaunch(apiKey.id, account.wallet, 2);
  assert.ok(reservation);
  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 3);

  await assert.rejects(() =>
    captureRaidLaunchBilling({
      deps,
      request: { headers: {} } as FastifyRequest,
      raidRequest: createSpawnInput(),
      raidId: 'raid-billing',
      launchPayment: { apiKeyBilling: reservation! },
    })
  );

  assert.equal(wasReconcileCalled(), false);
  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 3);
});

test('captureRaidLaunchBilling reconciles when terminal wait times out', async () => {
  const accountWallet = '0xBuyer00000000000000000000000000000002';
  const { controlState, deps, wasReconcileCalled } = buildBillingDeps({
    orchestrator: buildRunningOrchestrator(),
  });

  const account = controlState.ensurePublicAccount(accountWallet);
  controlState.creditBuyerBalance(account.wallet, 5);
  const apiKey = controlState.createBuyerApiKey({
    wallet: account.wallet,
    name: 'raid-timeout',
    keyHash: 'hash_raid_timeout',
    prefix: 'br_rt',
  });
  const reservation = controlState.reserveBuyerApiKeyLaunch(apiKey.id, account.wallet, 2);
  assert.ok(reservation);

  await captureRaidLaunchBilling({
    deps,
    request: { headers: {} } as FastifyRequest,
    raidRequest: createSpawnInput(),
    raidId: 'raid-timeout',
    launchPayment: { apiKeyBilling: reservation! },
  });

  assert.equal(wasReconcileCalled(), true);
  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 5);
});

function buildZeroSuccessOrchestrator(): BossRaidOrchestrator {
  const status: BossRaidStatusOutput = {
    raidId: 'raid-zero',
    status: 'final',
    experts: [],
    firstValidAvailable: false,
    sanitization: {
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      removedUrls: 0,
      trimmedFiles: 0,
      unsafeContentDetected: false,
      riskTier: 'safe',
      issues: [],
    },
  };
  const result: BossRaidResultOutput = {
    raidId: 'raid-zero',
    status: 'final',
    approvedSubmissions: [],
    rankedSubmissions: [],
    settlement: {
      successfulProvidersPaid: 0,
      escrowFundingUsd: 2,
      payoutPerSuccessfulProvider: 0,
      successfulProviderCount: 0,
      platformMarkupUsd: 0,
      minimumPayoutThresholdUsd: 0,
      approvedProviderCount: 0,
    },
  };
  return {
    getStatus: () => status,
    getResult: () => result,
    getRaid: () => ({ settlementExecution: { id: 'settle-zero' } }),
  } as unknown as BossRaidOrchestrator;
}

function buildCancelledOrchestrator(): BossRaidOrchestrator {
  const status: BossRaidStatusOutput = {
    raidId: 'raid-cancel',
    status: 'cancelled',
    experts: [],
    firstValidAvailable: false,
    sanitization: {
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      removedUrls: 0,
      trimmedFiles: 0,
      unsafeContentDetected: false,
      riskTier: 'safe',
      issues: [],
    },
  };
  const result: BossRaidResultOutput = {
    raidId: 'raid-cancel',
    status: 'cancelled',
    approvedSubmissions: [],
    rankedSubmissions: [],
  };
  return {
    getStatus: () => status,
    getResult: () => result,
    getRaid: () => ({}),
  } as unknown as BossRaidOrchestrator;
}

test('captureRaidLaunchBilling refunds api-key hold on zero successful providers', async () => {
  const accountWallet = '0xBuyer00000000000000000000000000000003';
  const { controlState, deps, wasReconcileCalled } = buildBillingDeps({
    orchestrator: buildZeroSuccessOrchestrator(),
  });

  const account = controlState.ensurePublicAccount(accountWallet);
  controlState.creditBuyerBalance(account.wallet, 5);
  const apiKey = controlState.createBuyerApiKey({
    wallet: account.wallet,
    name: 'raid-zero',
    keyHash: 'hash_raid_zero',
    prefix: 'br_rz',
  });
  const reservation = controlState.reserveBuyerApiKeyLaunch(apiKey.id, account.wallet, 2);
  assert.ok(reservation);
  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 3);

  await captureRaidLaunchBilling({
    deps,
    request: { headers: {} } as FastifyRequest,
    raidRequest: createSpawnInput(),
    raidId: 'raid-zero',
    launchPayment: { apiKeyBilling: reservation! },
  });

  assert.equal(wasReconcileCalled(), true);
  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 5);
});

test('captureRaidLaunchBilling refunds api-key hold when raid is cancelled', async () => {
  const accountWallet = '0xBuyer00000000000000000000000000000004';
  const { controlState, deps, wasReconcileCalled } = buildBillingDeps({
    orchestrator: buildCancelledOrchestrator(),
  });

  const account = controlState.ensurePublicAccount(accountWallet);
  controlState.creditBuyerBalance(account.wallet, 5);
  const apiKey = controlState.createBuyerApiKey({
    wallet: account.wallet,
    name: 'raid-cancel',
    keyHash: 'hash_raid_cancel',
    prefix: 'br_rc',
  });
  const reservation = controlState.reserveBuyerApiKeyLaunch(apiKey.id, account.wallet, 2);
  assert.ok(reservation);

  await captureRaidLaunchBilling({
    deps,
    request: { headers: {} } as FastifyRequest,
    raidRequest: createSpawnInput(),
    raidId: 'raid-cancel',
    launchPayment: { apiKeyBilling: reservation! },
  });

  assert.equal(wasReconcileCalled(), true);
  assert.equal(controlState.readPublicAccount(account.wallet)?.balanceUsd, 5);
});

function manaContext(reservedMana = 2000): NonNullable<LaunchPaymentContext['manaBilling']> {
  return {
    manaAccountId: 'account-test',
    sourceAppId: 'alkahest',
    reservationId: 'reservation-test',
    reservedMana,
  };
}

function stubManaCore(t: TestContext, fail = false) {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(fail ? { error: 'capture unavailable' } : {}), {
      status: fail ? 503 : 200,
    });
  });
  return calls;
}

function manaDeps(orchestrator = buildTerminalOrchestrator()) {
  const built = buildBillingDeps({ orchestrator });
  built.deps.ctx.env = {
    ...built.deps.ctx.env,
    BOSSRAID_MANA_CORE_URL: 'https://mana.test',
    BOSSRAID_MANA_CORE_KEY: 'test-only-key',
  };
  return built;
}

for (const [reservedMana, expected] of [
  [2000, 1250],
  [1000, 1000],
] as const) {
  test(`native Mana captures settled provider cost capped to ${reservedMana}`, async (t) => {
    const calls = stubManaCore(t);
    const { deps, wasReconcileCalled } = manaDeps();
    await captureRaidLaunchBilling({
      deps,
      request: { headers: {} } as FastifyRequest,
      raidRequest: createSpawnInput(),
      raidId: 'raid-billing',
      launchPayment: { manaBilling: manaContext(reservedMana) },
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /reservations\/reservation-test\/capture$/);
    assert.equal(calls[0]!.body.amount, expected);
    assert.deepEqual(calls[0]!.body.metadata, {
      sourceAppId: 'alkahest',
      raidId: 'raid-billing',
      receiptPath: '/verification?raidId=raid-billing',
      settledCostUsd: 1.25,
      refundedMana: reservedMana! - expected!,
    });
    assert.equal(wasReconcileCalled(), false);
  });
}

test('native Mana honors quote conversion without chat token pricing', async (t) => {
  const calls = stubManaCore(t);
  const { deps } = manaDeps();
  const manaBilling = manaContext();
  manaBilling.quoteSnapshot = {
    quoteId: 'quote-test',
    manaQuote: { manaPerUsd: 400 },
    providers: [],
  } as unknown as NonNullable<typeof manaBilling.quoteSnapshot>;
  await captureRaidLaunchBilling({
    deps,
    request: { headers: {} } as FastifyRequest,
    raidRequest: createSpawnInput(),
    raidId: 'raid-billing',
    launchPayment: { manaBilling },
  });
  assert.equal(calls[0]?.body.amount, 500);
  assert.equal((calls[0]?.body.metadata as Record<string, unknown>).refundedMana, 1500);
});

for (const [reason, orchestrator] of [
  ['cancelled', buildCancelledOrchestrator],
  ['zero success', buildZeroSuccessOrchestrator],
] as const) {
  test(`native Mana fully refunds ${reason}`, async (t) => {
    const calls = stubManaCore(t);
    const { deps, wasReconcileCalled } = manaDeps(orchestrator());
    await captureRaidLaunchBilling({
      deps,
      request: { headers: {} } as FastifyRequest,
      raidRequest: createSpawnInput(),
      raidId: 'raid-billing',
      launchPayment: { manaBilling: manaContext() },
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0]!.url, /\/refund$/);
    assert.equal(wasReconcileCalled(), true);
  });
}

test('native Mana capture errors remain visible without refunding completed work', async (t) => {
  const calls = stubManaCore(t, true);
  const { deps, wasReconcileCalled } = manaDeps();
  await assert.rejects(
    captureRaidLaunchBilling({
      deps,
      request: { headers: {} } as FastifyRequest,
      raidRequest: createSpawnInput(),
      raidId: 'raid-billing',
      launchPayment: { manaBilling: manaContext() },
    }),
    /capture unavailable/
  );
  assert.equal(calls.length, 1);
  assert.equal(wasReconcileCalled(), false);
});

for (const amount of [undefined, NaN, Infinity, -Infinity]) {
  test(`native Mana rejects invalid settlement amount ${amount} without capture or refund`, async (t) => {
    const calls = stubManaCore(t);
    const orchestrator = buildTerminalOrchestrator();
    orchestrator.getResult('raid-billing').settlement!.successfulProvidersPaid = amount as number;
    const { deps, wasReconcileCalled } = manaDeps(orchestrator);
    await assert.rejects(
      captureRaidLaunchBilling({
        deps,
        request: { headers: {} } as FastifyRequest,
        raidRequest: createSpawnInput(),
        raidId: 'raid-billing',
        launchPayment: { manaBilling: manaContext() },
      }),
      /settled provider cost/
    );
    assert.equal(calls.length, 0);
    assert.equal(wasReconcileCalled(), false);
  });
}

test('native x402 stays settled without a Mana debit or reconciliation', async (t) => {
  const calls = stubManaCore(t);
  const { deps, wasReconcileCalled } = manaDeps();
  const ledger = t.mock.method(deps.payment, 'recordMarketplaceLedgersFromRaid');
  await captureRaidLaunchBilling({
    deps,
    request: { headers: {} } as FastifyRequest,
    raidRequest: createSpawnInput(),
    raidId: 'raid-billing',
    launchPayment: {
      settlement: { success: true } as NonNullable<LaunchPaymentContext['settlement']>,
      escrowFundingUsd: 2,
    },
  });
  assert.equal(calls.length, 0);
  assert.equal(wasReconcileCalled(), false);
  assert.equal(ledger.mock.calls[0]?.arguments[0].costUsd, 1.25);
  assert.equal(ledger.mock.calls[0]?.arguments[0].skipBuyerPurchase, true);
});

test('native API-key captures settled provider cost without Mana request', async (t) => {
  const calls = stubManaCore(t);
  const { deps, wasReconcileCalled } = manaDeps();
  const capture = t.mock.method(
    deps.payment,
    'captureApiKeyBilling',
    (_input: Parameters<typeof deps.payment.captureApiKeyBilling>[0]) => {}
  );
  await captureRaidLaunchBilling({
    deps,
    request: { headers: {} } as FastifyRequest,
    raidRequest: createSpawnInput(),
    raidId: 'raid-billing',
    launchPayment: {
      apiKeyBilling: { apiKeyId: 'key-test', wallet: '0xbuyer', reservedUsd: 2, useBalance: true },
    },
  });
  assert.equal(capture.mock.calls[0]?.arguments[0].actualCostUsd, 1.25);
  assert.equal(calls.length, 0);
  assert.equal(wasReconcileCalled(), false);
});

for (const manaPerUsd of [0, -1, NaN, Infinity]) {
  test(`native Mana rejects invalid quote conversion ${manaPerUsd}`, async (t) => {
    const calls = stubManaCore(t);
    const { deps, wasReconcileCalled } = manaDeps();
    const manaBilling = manaContext();
    manaBilling.quoteSnapshot = { manaQuote: { manaPerUsd } } as NonNullable<
      typeof manaBilling.quoteSnapshot
    >;
    await assert.rejects(
      captureRaidLaunchBilling({
        deps,
        request: { headers: {} } as FastifyRequest,
        raidRequest: createSpawnInput(),
        raidId: 'raid-billing',
        launchPayment: { manaBilling },
      }),
      /valid quote conversion/
    );
    assert.equal(calls.length, 0);
    assert.equal(wasReconcileCalled(), false);
  });
}
