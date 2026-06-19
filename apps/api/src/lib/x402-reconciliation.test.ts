import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiControlState } from '../control-state.js';
import { createApiMetrics } from './metrics.js';
import { installMockX402Facilitator } from '../test/helpers.js';
import type { ApiContext } from '../api-context.js';
import { attemptX402Refund, processX402ReconciliationQueue } from './x402-reconciliation.js';

test('reconciliation worker completes pending refunds when facilitator succeeds', async () => {
  const facilitator = installMockX402Facilitator();
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'true',
    BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.test/x402',
    BOSSRAID_X402_PAY_TO: '0xabc',
  });
  controlState.setX402Enabled(true);
  const ctx = {
    controlState,
    apiMetrics: createApiMetrics(),
    env: {
      ...process.env,
      BOSSRAID_X402_ENABLED: 'true',
      BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.test/x402',
      BOSSRAID_X402_PAY_TO: '0xabc',
    },
  } as unknown as ApiContext;

  try {
    controlState.upsertX402Reconciliation({
      id: 'x402rec_test',
      kind: 'spawn_refund',
      status: 'pending',
      reason: 'spawn_failed',
      route: 'raid',
      paymentSignature: Buffer.from(JSON.stringify({ proof: 'sig' })).toString('base64'),
      paymentRequiredJson: JSON.stringify({
        x402Version: 1,
        accepts: [
          {
            scheme: 'exact',
            network: 'base-sepolia',
            maxAmountRequired: '1000000',
            resource: 'http://127.0.0.1:8787/v1/raid',
            payTo: '0xabc',
            asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          },
        ],
      }),
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const completed = await processX402ReconciliationQueue(ctx);
    assert.equal(completed, 1);
    const updated = controlState.getX402Reconciliation('x402rec_test');
    assert.equal(updated?.status, 'completed');
    assert.ok(facilitator.requests.some((request) => request.url.endsWith('/refund')));
  } finally {
    facilitator.restore();
  }
});

test('reconciliation worker continues when one entry has corrupt paymentRequiredJson', async () => {
  const facilitator = installMockX402Facilitator();
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'true',
    BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.test/x402',
    BOSSRAID_X402_PAY_TO: '0xabc',
  });
  controlState.setX402Enabled(true);
  const ctx = {
    controlState,
    apiMetrics: createApiMetrics(),
    env: {
      ...process.env,
      BOSSRAID_X402_ENABLED: 'true',
      BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.test/x402',
      BOSSRAID_X402_PAY_TO: '0xabc',
    },
  } as unknown as ApiContext;

  try {
    controlState.upsertX402Reconciliation({
      id: 'x402rec_corrupt',
      kind: 'spawn_refund',
      status: 'pending',
      reason: 'spawn_failed',
      route: 'raid',
      paymentSignature: Buffer.from(JSON.stringify({ proof: 'sig' })).toString('base64'),
      paymentRequiredJson: 'not-json',
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    controlState.upsertX402Reconciliation({
      id: 'x402rec_valid',
      kind: 'spawn_refund',
      status: 'pending',
      reason: 'spawn_failed',
      route: 'raid',
      paymentSignature: Buffer.from(JSON.stringify({ proof: 'sig2' })).toString('base64'),
      paymentRequiredJson: JSON.stringify({
        x402Version: 1,
        accepts: [
          {
            scheme: 'exact',
            network: 'base-sepolia',
            maxAmountRequired: '1000000',
            resource: 'http://127.0.0.1:8787/v1/raid',
            payTo: '0xabc',
            asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          },
        ],
      }),
      attempts: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const completed = await processX402ReconciliationQueue(ctx);
    assert.equal(completed, 1);
    assert.equal(controlState.getX402Reconciliation('x402rec_corrupt')?.attempts, 1);
    assert.ok(controlState.getX402Reconciliation('x402rec_corrupt')?.lastError);
    assert.equal(controlState.getX402Reconciliation('x402rec_valid')?.status, 'completed');
  } finally {
    facilitator.restore();
  }
});

test('reconciliation worker claims one entry per pass', async () => {
  const facilitator = installMockX402Facilitator();
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'true',
    BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.test/x402',
    BOSSRAID_X402_PAY_TO: '0xabc',
  });
  controlState.setX402Enabled(true);
  const ctx = {
    controlState,
    apiMetrics: createApiMetrics(),
    env: {
      ...process.env,
      BOSSRAID_X402_ENABLED: 'true',
      BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.test/x402',
      BOSSRAID_X402_PAY_TO: '0xabc',
    },
  } as unknown as ApiContext;

  try {
    const now = Date.now();
    controlState.upsertX402Reconciliation({
      id: 'x402rec_claimed',
      kind: 'spawn_refund',
      status: 'pending',
      reason: 'spawn_failed',
      route: 'raid',
      paymentSignature: Buffer.from(JSON.stringify({ proof: 'sig' })).toString('base64'),
      paymentRequiredJson: JSON.stringify({
        x402Version: 1,
        accepts: [
          {
            scheme: 'exact',
            network: 'base-sepolia',
            maxAmountRequired: '1000000',
            resource: 'http://127.0.0.1:8787/v1/raid',
            payTo: '0xabc',
            asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
          },
        ],
      }),
      attempts: 0,
      processingHolder: 'other-worker',
      processingExpiresAt: new Date(now + 60_000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const completed = await processX402ReconciliationQueue(ctx);
    assert.equal(completed, 0);
    assert.equal(controlState.getX402Reconciliation('x402rec_claimed')?.status, 'pending');
  } finally {
    facilitator.restore();
  }
});

test('attemptX402Refund refunds immediately when facilitator succeeds', async () => {
  const facilitator = installMockX402Facilitator();
  const controlState = createApiControlState({
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'true',
    BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.test/x402',
    BOSSRAID_X402_PAY_TO: '0xabc',
  });
  const ctx = {
    controlState,
    apiMetrics: createApiMetrics(),
    env: {
      ...process.env,
      BOSSRAID_X402_ENABLED: 'true',
      BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.test/x402',
      BOSSRAID_X402_PAY_TO: '0xabc',
    },
  } as unknown as ApiContext;

  try {
    const result = await attemptX402Refund(ctx, {
      kind: 'spawn_refund',
      route: 'raid',
      reason: 'spawn_failed',
      paymentSignature: Buffer.from(JSON.stringify({ proof: 'sig' })).toString('base64'),
      paymentRequired: JSON.parse(
        JSON.stringify({
          x402Version: 1,
          accepts: [
            {
              scheme: 'exact',
              network: 'base-sepolia',
              maxAmountRequired: '1000000',
              resource: 'http://127.0.0.1:8787/v1/raid',
              payTo: '0xabc',
              asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
              description: 'raid launch',
              mimeType: 'application/json',
              maxTimeoutSeconds: 60,
            },
          ],
        })
      ),
      raidId: 'raid_test',
    });
    assert.equal(result.refunded, true);
    assert.ok(facilitator.requests.some((request) => request.url.endsWith('/refund')));
  } finally {
    facilitator.restore();
  }
});
