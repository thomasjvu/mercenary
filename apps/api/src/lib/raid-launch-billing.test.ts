import assert from 'node:assert/strict';
import test from 'node:test';
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
  captureApiKeyBilling?: () => void;
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
  const captureApiKeyBilling =
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
          route: 'raid' | 'chat' | 'inference';
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
