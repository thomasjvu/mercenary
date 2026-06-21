import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import { buildTestApiServer } from './test/helpers.js';
import {
  createTestApiServer,
  createProviderProfile,
  createRaidRequestBody,
  createX402PaidTestEnv,
  readyHealth,
} from './test/helpers.js';

test('POST /v1/raid returns 409 when no providers are eligible', async () => {
  const app = createTestApiServer();

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: createRaidRequestBody(),
    });

    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), {
      error: 'no_eligible_providers',
      message: 'No eligible providers are currently available for this raid request.',
    });
  } finally {
    await app.close();
  }
});

test('malformed raid requests return 400', async () => {
  const app = createTestApiServer();

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: {},
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: 'bad_request',
      message: 'Expected object for task.',
    });
  } finally {
    await app.close();
  }
});

test('native raid requests require an explicit payout budget', async () => {
  const app = createTestApiServer();

  try {
    const originalBody = createRaidRequestBody();
    const { maxTotalCost: _omittedBudget, ...raidPolicy } = originalBody.raidPolicy;
    const body = {
      ...originalBody,
      raidPolicy,
    };

    const response = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: body,
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: 'bad_request',
      message: 'Expected finite number for raid_policy.max_total_cost.',
    });
  } finally {
    await app.close();
  }
});

test('unknown raid routes return 404 for authorized readers', async () => {
  const app = createTestApiServer([], {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/raid/raid_missing',
      headers: {
        authorization: 'Bearer admin-secret',
      },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: 'not_found',
      message: 'Unknown raid: raid_missing',
    });
  } finally {
    await app.close();
  }
});

test('raid status and result require the issued raid access token', async () => {
  const provider = {
    profile: createProviderProfile('provider-reads'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-reads',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {},
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const spawn = await orchestrator.spawnRaid({
    taskTitle: 'Summarize the memo',
    taskDescription: 'Review the memo and summarize the main risks.',
    language: 'text',
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: 'text',
      artifactTypes: ['text'],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ['analysis'],
      minReputation: 0,
      allowedOutputTypes: ['text'],
      privacyMode: 'prefer',
    },
    rewardPolicy: {
      splitStrategy: 'equal_success_only',
    },
    privacyMode: {
      redactSecrets: true,
      redactIdentifiers: true,
      allowFullRepo: false,
    },
    hostContext: {
      host: 'codex',
    },
  });
  const app = buildTestApiServer(orchestrator, {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
  });

  try {
    assert.ok(spawn.raidAccessToken.length > 10);
    assert.equal(
      spawn.receiptPath,
      `/verification?raidId=${spawn.raidId}&token=${spawn.raidAccessToken}`
    );

    const unauthorizedStatus = await app.inject({
      method: 'GET',
      url: `/v1/raid/${spawn.raidId}`,
    });
    assert.equal(unauthorizedStatus.statusCode, 401);

    const authorizedStatus = await app.inject({
      method: 'GET',
      url: `/v1/raid/${spawn.raidId}`,
      headers: {
        'x-bossraid-raid-token': spawn.raidAccessToken,
      },
    });
    assert.equal(authorizedStatus.statusCode, 200);
    assert.equal(authorizedStatus.json().raidId, spawn.raidId);

    const authorizedResult = await app.inject({
      method: 'GET',
      url: `/v1/raid/${spawn.raidId}/result`,
      headers: {
        'x-bossraid-raid-token': spawn.raidAccessToken,
      },
    });
    assert.equal(authorizedResult.statusCode, 200);
    assert.equal(authorizedResult.json().raidId, spawn.raidId);

    const adminBypass = await app.inject({
      method: 'GET',
      url: `/v1/raid/${spawn.raidId}`,
      headers: {
        authorization: 'Bearer admin-secret',
      },
    });
    assert.equal(adminBypass.statusCode, 200);
  } finally {
    await app.close();
  }
});
