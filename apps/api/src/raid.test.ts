import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import { buildApiServer } from './index.js';
import {
  createProviderProfile,
  createRaidRequestBody,
  createX402PaidTestEnv,
  readyHealth,
} from './test/helpers.js';

test('POST /v1/raid returns 409 when no providers are eligible', async () => {
  const app = buildApiServer(new BossRaidOrchestrator());

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
  const app = buildApiServer(new BossRaidOrchestrator());

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
  const app = buildApiServer(new BossRaidOrchestrator());

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
  const app = buildApiServer(new BossRaidOrchestrator(), {
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
  const app = buildApiServer(orchestrator, {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
  });

  try {
    assert.ok(spawn.raidAccessToken.length > 10);
    assert.equal(
      spawn.receiptPath,
      `/receipt?raidId=${spawn.raidId}&token=${spawn.raidAccessToken}`
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
      url: `/v1/raids/${spawn.raidId}`,
      headers: {
        authorization: 'Bearer admin-secret',
      },
    });
    assert.equal(adminBypass.statusCode, 200);
  } finally {
    await app.close();
  }
});

test('public manifest route describes Mercenary and the native raid flow', async () => {
  const provider = {
    profile: createProviderProfile('provider-manifest', {
      erc8004: {
        agentId: 'agent-manifest-provider',
        operatorWallet: '0x00000000000000000000000000000000000000a1',
        registrationTx: '0xregprovider',
        identityRegistry: '0x00000000000000000000000000000000000000b1',
        reputationRegistry: '0x00000000000000000000000000000000000000c1',
        validationRegistry: '0x00000000000000000000000000000000000000d1',
        validationTxs: ['0xvalprovider'],
      },
      trust: {
        score: 91,
        reason: 'registered and validated via ERC-8004',
        source: 'erc8004',
      },
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-manifest',
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
  const app = buildApiServer(orchestrator, {
    BOSSRAID_ERC8004_AGENT_ID: 'mercenary-mainnet-8004',
    BOSSRAID_ERC8004_OPERATOR_WALLET: '0x00000000000000000000000000000000000000aa',
    BOSSRAID_ERC8004_REGISTRATION_TX: '0xregmercenary',
    BOSSRAID_ERC8004_IDENTITY_REGISTRY: '0x00000000000000000000000000000000000000bb',
    BOSSRAID_ERC8004_REPUTATION_REGISTRY: '0x00000000000000000000000000000000000000cc',
    BOSSRAID_ERC8004_VALIDATION_REGISTRY: '0x00000000000000000000000000000000000000dd',
    BOSSRAID_ERC8004_VALIDATION_TXS: '0xvalmercenary',
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/agent.json',
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['content-type'], 'application/json; charset=utf-8');

    const body = response.json();
    assert.equal(body.schemaVersion, 'bossraid-agent-manifest/v1');
    assert.equal(body.agent.id, 'mercenary-v1');
    assert.equal(body.agent.identity.status, 'registered');
    assert.equal(body.agent.identity.agentId, 'mercenary-mainnet-8004');
    assert.equal(body.endpoints.nativeRaid, 'POST /v1/raid');
    assert.equal(
      body.endpoints.agentLogTemplate,
      'GET /v1/raids/:raidId/agent_log.json?token=<raidAccessToken>'
    );
    assert.equal(body.computeConstraints.providerTransport, 'http');
    assert.equal(body.computeConstraints.maxEvaluatorJobs, 2);
    assert.equal(body.providerPool.totalProviders, 1);
    assert.deepEqual(body.providerPool.providerIds, ['provider-manifest']);
    assert.equal(body.providerPool.erc8004RegisteredProviders, 1);
    assert.equal(body.providerPool.trustScoredProviders, 1);
    assert.equal(body.providerPool.averageTrustScore, 91);
  } finally {
    await app.close();
  }
});

test('per-raid agent log route accepts the raid access token as a query parameter', async () => {
  const provider = {
    profile: createProviderProfile('provider-agent-log', {
      modelFamily: 'venice',
      privacy: {
        noDataRetention: true,
        teeAttested: true,
      },
      erc8004: {
        agentId: 'erc8004-agent-log',
        registrationTx: '0xagentlog',
        operatorWallet: '0xoperator',
        verification: {
          status: 'verified',
          checkedAt: '2026-03-23T00:00:00.000Z',
          agentRegistry: '0xidentityregistry',
          agentUri: 'ipfs://erc8004-agent-log',
          registrationTxFound: true,
          operatorMatchesOwner: true,
        },
      },
      trust: {
        score: 88,
        source: 'erc8004',
      },
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-agent-log',
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
    taskTitle: 'Inspect the incident notes',
    taskDescription: 'Review the notes and summarize the likely cause.',
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
      privacyMode: 'strict',
      requireErc8004: true,
      minTrustScore: 80,
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
  const app = buildApiServer(orchestrator, {});

  try {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/raids/${spawn.raidId}/agent_log.json?token=${encodeURIComponent(spawn.raidAccessToken)}`,
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers['cache-control'], 'private, no-store');

    const body = response.json();
    assert.equal(body.schemaVersion, 'bossraid-agent-log/v1');
    assert.equal(body.source.kind, 'derived_from_raid_state');
    assert.equal(body.run.raidId, spawn.raidId);
    assert.equal(body.run.host, 'codex');
    assert.equal(
      body.run.receiptPath,
      `/receipt?raidId=${spawn.raidId}&token=${spawn.raidAccessToken}`
    );
    assert.equal(body.task.constraints.privacyMode, 'strict');
    assert.equal(body.task.constraints.requireErc8004, true);
    assert.equal(body.routing.policy.venicePrivateLane, true);
    assert.equal(body.routing.providers[0].veniceBacked, true);
    assert.equal(body.routing.providers[0].erc8004Registered, true);
    assert.equal(body.routing.providers[0].erc8004VerificationStatus, 'verified');
    assert.equal(body.routing.providers[0].agentRegistry, '0xidentityregistry');
    assert.equal(body.routing.providers[0].registrationTx, '0xagentlog');
    assert.equal(body.finalOutput.routingPolicy.requireErc8004, true);
  } finally {
    await app.close();
  }
});

test('raid result exposes ERC-8183-aligned settlement proof data', async () => {
  const provider = {
    profile: createProviderProfile('provider-settlement-proof'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-settlement-proof',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 1_000,
      hardExecutionMs: 1_000,
      raidAbsoluteMs: 1_000,
    },
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const spawn = await orchestrator.spawnRaid({
    taskTitle: 'Explain the form regression',
    taskDescription: 'Inspect the flow and explain why the form remains disabled.',
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
  const raid = orchestrator.getRaid(spawn.raidId)!;
  raid.status = 'final';
  raid.updatedAt = new Date().toISOString();
  raid.settlementExecution = {
    mode: 'file',
    proofStandard: 'erc8183_aligned',
    lifecycleStatus: 'synthetic',
    executedAt: new Date().toISOString(),
    artifactPath: 'temp/settlements/mock.json',
    registryRaidRef: '1',
    taskHash: '0xtaskhash',
    evaluationHash: '0xevaluationhash',
    successfulProviderIds: ['provider-settlement-proof'],
    allocations: [
      {
        providerId: 'provider-settlement-proof',
        role: 'successful',
        status: 'complete',
        totalAmount: 10,
      },
    ],
    contracts: {
      registryAddress: '0x0000000000000000000000000000000000000101',
      escrowAddress: '0x0000000000000000000000000000000000000102',
      tokenAddress: '0x0000000000000000000000000000000000000103',
      clientAddress: '0x0000000000000000000000000000000000000104',
      evaluatorAddress: '0x0000000000000000000000000000000000000105',
      chainId: '8453',
    },
    registryCall: {
      method: 'finalizeRaid',
      args: ['1', '0xevaluationhash'],
    },
    childJobs: [
      {
        jobRef: 'raid_1:provider-settlement-proof',
        providerId: 'provider-settlement-proof',
        providerAddress: '0x0000000000000000000000000000000000000106',
        role: 'analysis',
        status: 'complete',
        requestedAction: 'complete',
        lifecycleStatus: 'synthetic',
        budgetUsd: 10,
        budgetAtomic: '10000000',
        submitResultHash: '0xsubmissionhash',
        completionPolicy: 'submit and complete child job',
        nextAction: 'Switch to onchain settlement mode to create ERC-8183 child jobs.',
        syntheticJobId: 'job_1',
      },
    ],
    warnings: ['synthetic settlement record'],
    transactionHashes: ['0xsettlementtx'],
    jobIds: ['1'],
  };
  const app = buildApiServer(orchestrator, {});

  try {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/raids/${spawn.raidId}/result`,
      headers: {
        'x-bossraid-raid-token': spawn.raidAccessToken,
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.settlementExecution.proofStandard, 'erc8183_aligned');
    assert.equal(body.settlementExecution.lifecycleStatus, 'synthetic');
    assert.equal(body.settlementExecution.registryRaidRef, '1');
    assert.deepEqual(body.settlementExecution.registryCall.args, ['1', '0xevaluationhash']);
    assert.equal(body.settlementExecution.contracts.registryAddress.length > 0, true);
    assert.equal(body.settlementExecution.contracts.escrowAddress.length > 0, true);
    assert.equal(body.settlementExecution.childJobs.length, 1);
    assert.equal(body.settlementExecution.childJobs[0].providerId, 'provider-settlement-proof');
    assert.equal(body.settlementExecution.childJobs[0].requestedAction, 'complete');
    assert.equal(body.settlementExecution.warnings[0], 'synthetic settlement record');
    assert.equal(body.routingProof.providers[0].providerId, 'provider-settlement-proof');
  } finally {
    await app.close();
  }
});

test('public raid spawn is rate limited before orchestration work runs', async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_PUBLIC_RATE_LIMIT_MAX: '1',
    BOSSRAID_PUBLIC_RATE_LIMIT_WINDOW_MS: '60000',
  });

  try {
    const firstAttempt = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: createRaidRequestBody(),
    });
    assert.equal(firstAttempt.statusCode, 409);

    const secondAttempt = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: createRaidRequestBody(),
    });
    assert.equal(secondAttempt.statusCode, 429);
    assert.equal(secondAttempt.json().error, 'rate_limited');
    assert.equal(secondAttempt.headers['retry-after'], '60');
  } finally {
    await app.close();
  }
});

test('public rate limiting ignores spoofed forwarded headers unless trustProxy is enabled', async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_PUBLIC_RATE_LIMIT_MAX: '1',
    BOSSRAID_PUBLIC_RATE_LIMIT_WINDOW_MS: '60000',
  });

  try {
    const firstAttempt = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      headers: {
        'x-forwarded-for': '198.51.100.10',
      },
      payload: createRaidRequestBody(),
    });
    assert.equal(firstAttempt.statusCode, 409);

    const secondAttempt = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      headers: {
        'x-forwarded-for': '203.0.113.25',
      },
      payload: createRaidRequestBody(),
    });
    assert.equal(secondAttempt.statusCode, 429);
    assert.equal(secondAttempt.json().error, 'rate_limited');
  } finally {
    await app.close();
  }
});

test('demo raid route can stay free while native raid stays paid', async () => {
  const providers = ['provider-demo-free-a', 'provider-demo-free-b'].map((providerId) => ({
    profile: createProviderProfile(providerId),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: `run-${providerId}`,
      };
    },
    async run(): Promise<void> {
      return;
    },
  }));
  const env = {
    BOSSRAID_DEMO_ROUTE_ENABLED: 'true',
    BOSSRAID_DEMO_TOKEN: 'demo-secret',
    ...createX402PaidTestEnv(),
  };

  const demoApp = buildApiServer(
    new BossRaidOrchestrator(providers, {}, undefined, undefined, async (profile) =>
      readyHealth(profile.providerId)
    ),
    env
  );
  const paidApp = buildApiServer(
    new BossRaidOrchestrator(providers, {}, undefined, undefined, async (profile) =>
      readyHealth(profile.providerId)
    ),
    env
  );

  try {
    const demoResponse = await demoApp.inject({
      method: 'POST',
      url: '/v1/demo/raid',
      headers: {
        'x-bossraid-demo-token': 'demo-secret',
      },
      payload: createRaidRequestBody(),
    });

    assert.equal(demoResponse.statusCode, 200);
    assert.equal(demoResponse.headers['payment-required'], undefined);

    const paidResponse = await paidApp.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: createRaidRequestBody(),
    });

    assert.equal(paidResponse.statusCode, 402);
  } finally {
    await demoApp.close();
    await paidApp.close();
  }
});

test('demo raid route returns 404 when disabled', async () => {
  const provider = {
    profile: createProviderProfile('provider-demo-disabled'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-demo-disabled',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const app = buildApiServer(
    new BossRaidOrchestrator([provider], {}, undefined, undefined, async (profile) =>
      readyHealth(profile.providerId)
    ),
    createX402PaidTestEnv()
  );

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/demo/raid',
      payload: createRaidRequestBody(),
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: 'not_found',
      message: 'Demo raid route is not enabled.',
    });
  } finally {
    await app.close();
  }
});

test('demo route startup fails closed when enabled without a demo token', () => {
  assert.throws(
    () =>
      buildApiServer(new BossRaidOrchestrator([]), {
        ...process.env,
        BOSSRAID_STORAGE_BACKEND: 'memory',
        BOSSRAID_DEMO_ROUTE_ENABLED: 'true',
      }),
    /BOSSRAID_DEMO_TOKEN is required/
  );
});

test('demo raid route can require a dedicated demo token', async () => {
  const provider = {
    profile: createProviderProfile('provider-demo-token'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-demo-token',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const app = buildApiServer(
    new BossRaidOrchestrator([provider], {}, undefined, undefined, async (profile) =>
      readyHealth(profile.providerId)
    ),
    createX402PaidTestEnv({
      BOSSRAID_DEMO_ROUTE_ENABLED: 'true',
      BOSSRAID_DEMO_TOKEN: 'demo-secret',
    })
  );

  try {
    const unauthorized = await app.inject({
      method: 'POST',
      url: '/v1/demo/raid',
      payload: createRaidRequestBody(),
    });

    assert.equal(unauthorized.statusCode, 401);
    assert.deepEqual(unauthorized.json(), {
      error: 'unauthorized',
      message: 'Demo raid route requires a valid x-bossraid-demo-token header.',
    });

    const authorized = await app.inject({
      method: 'POST',
      url: '/v1/demo/raid',
      headers: {
        'x-bossraid-demo-token': 'demo-secret',
      },
      payload: createRaidRequestBody(),
    });

    assert.equal(authorized.statusCode, 200);
    assert.equal(authorized.headers['payment-required'], undefined);
  } finally {
    await app.close();
  }
});
