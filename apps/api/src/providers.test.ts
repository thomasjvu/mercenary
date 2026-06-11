import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { NETWORK } from '@bossraid/constants';
import { buildApiServer } from './index.js';
import {
  createProviderProfile,
  createRaidRequestBody,
  readyHealth,
  waitFor,
} from './test/helpers.js';

test('provider submit requires the active providerRunId', async () => {
  const provider = {
    profile: createProviderProfile('provider-alpha'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-alpha',
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

  await waitFor(
    () =>
      orchestrator.getRaid(spawn.raidId)?.assignments['provider-alpha']?.providerRunId ===
      'run-alpha'
  );

  const app = buildApiServer(orchestrator);

  try {
    const missingRunId = await app.inject({
      method: 'POST',
      url: '/v1/providers/provider-alpha/submit',
      payload: {
        raidId: spawn.raidId,
        answerText: 'Main risk is stale provider state.',
        explanation: 'The memo points to stale routing state as the main system risk.',
        confidence: 0.8,
        filesTouched: [],
      },
    });

    assert.equal(missingRunId.statusCode, 409);
    assert.equal(missingRunId.json().error, 'provider_run_required');

    const wrongRunId = await app.inject({
      method: 'POST',
      url: '/v1/providers/provider-alpha/submit',
      payload: {
        raidId: spawn.raidId,
        providerRunId: 'run-wrong',
        answerText: 'Main risk is stale provider state.',
        explanation: 'The memo points to stale routing state as the main system risk.',
        confidence: 0.8,
        filesTouched: [],
      },
    });

    assert.equal(wrongRunId.statusCode, 409);
    assert.equal(wrongRunId.json().error, 'provider_run_mismatch');
  } finally {
    await app.close();
  }
});

test('provider callbacks accept custom bearer header names', async () => {
  const provider = {
    profile: createProviderProfile('provider-custom-auth', {
      auth: {
        type: 'bearer',
        token: 'secret-custom-header',
        headerName: 'x-provider-token',
      },
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-custom',
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

  await waitFor(
    () =>
      orchestrator.getRaid(spawn.raidId)?.assignments['provider-custom-auth']?.providerRunId ===
      'run-custom'
  );

  const app = buildApiServer(orchestrator);

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/providers/provider-custom-auth/submit',
      headers: {
        'x-provider-token': 'Bearer secret-custom-header',
      },
      payload: {
        raidId: spawn.raidId,
        providerRunId: 'run-custom',
        answerText: 'Main risk is stale provider state.',
        explanation: 'The memo points to stale routing state as the main system risk.',
        confidence: 0.8,
        filesTouched: [],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'final');
  } finally {
    await app.close();
  }
});

test('provider submissions accept larger artifact callbacks than the public API body limit', async () => {
  const provider = {
    profile: createProviderProfile('provider-large-submit', {
      outputTypes: ['text', 'bundle'],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-large-submit',
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
    taskTitle: 'Summarize the memo',
    taskDescription: 'Review the memo and summarize the main risks.',
    language: 'text',
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: 'text',
      artifactTypes: ['text', 'bundle'],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ['analysis'],
      minReputation: 0,
      allowedOutputTypes: ['text', 'bundle'],
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

  await waitFor(
    () =>
      orchestrator.getRaid(spawn.raidId)?.assignments['provider-large-submit']?.providerRunId ===
      'run-large-submit'
  );

  const app = buildApiServer(orchestrator, {
    BOSSRAID_API_BODY_LIMIT_BYTES: '512',
  });

  try {
    const largePayload = Buffer.from('x'.repeat(4_096), 'utf8').toString('base64');
    const response = await app.inject({
      method: 'POST',
      url: '/v1/providers/provider-large-submit/submit',
      payload: {
        raidId: spawn.raidId,
        providerRunId: 'run-large-submit',
        answerText: 'Main risk is stale provider state.',
        explanation: 'The memo points to stale routing state as the main system risk.',
        confidence: 0.8,
        filesTouched: [],
        artifacts: [
          {
            outputType: 'bundle',
            label: 'Large inline bundle',
            uri: `data:application/json;base64,${largePayload}`,
            mimeType: 'application/json',
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'final');
  } finally {
    await app.close();
  }
});

test('registry write routes require the configured registry token', async () => {
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_REGISTRY_TOKEN: 'registry-secret',
  });

  try {
    const unauthorized = await app.inject({
      method: 'POST',
      url: '/agents/register',
      payload: {
        agentId: 'secure-review-01',
        name: 'Secure Review',
        endpoint: `http://${NETWORK.LOCALHOST}:${NETWORK.TEST_PROVIDER_PORT_START}`,
      },
    });

    assert.equal(unauthorized.statusCode, 401);

    const authorized = await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: {
        authorization: 'Bearer registry-secret',
      },
      payload: {
        agentId: 'secure-review-01',
        name: 'Secure Review',
        endpoint: `http://${NETWORK.LOCALHOST}:${NETWORK.TEST_PROVIDER_PORT_START}`,
      },
    });

    assert.equal(authorized.statusCode, 200);
    assert.equal(authorized.json().providerId, 'secure-review-01');
  } finally {
    await app.close();
  }
});

test('registry verification probes provider health and stores separate verification state', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ready: true,
        agentFramework: 'codex',
        modelProvider: 'openai',
        model: 'gpt-5.5',
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  const app = buildApiServer(new BossRaidOrchestrator(), {
    BOSSRAID_REGISTRY_TOKEN: 'registry-secret',
  });

  try {
    await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: {
        authorization: 'Bearer registry-secret',
      },
      payload: {
        agentId: 'seller-codex-gpt55',
        name: 'Seller Codex GPT-5.5',
        endpoint: `http://${NETWORK.LOCALHOST}:${NETWORK.TEST_PROVIDER_PORT_START}`,
        supportedLanguages: ['text'],
        outputTypes: ['text', 'json'],
        agentFramework: 'codex',
        modelProvider: 'openai',
        modelId: 'gpt-5.5',
        pricing: {
          pricePerTaskUsd: 0.25,
        },
        auth: {
          type: 'bearer',
          token: 'provider-secret',
        },
      },
    });

    const verified = await app.inject({
      method: 'POST',
      url: '/agents/seller-codex-gpt55/verify',
      headers: {
        authorization: 'Bearer registry-secret',
      },
    });

    assert.equal(verified.statusCode, 200);
    const body = verified.json();
    assert.equal(body.provider.verification.status, 'verified');
    assert.equal(body.provider.verification.apiVerified, true);
    assert.equal(body.provider.verification.frameworkVerified, true);
    assert.equal(body.provider.verification.modelVerified, true);
    assert.equal(body.provider.auth, undefined);
    assert.equal(body.health.model, 'gpt-5.5');
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test('public provider routes strip auth material and private diagnostics', async () => {
  const provider = {
    profile: createProviderProfile('provider-public', {
      auth: {
        type: 'bearer',
        token: 'super-secret-provider-token',
      },
      erc8004: {
        agentId: 'agent-provider-public',
        operatorWallet: '0x0000000000000000000000000000000000000011',
        registrationTx: '0xregpublic',
        identityRegistry: '0x0000000000000000000000000000000000000022',
        reputationRegistry: '0x0000000000000000000000000000000000000033',
        validationRegistry: '0x0000000000000000000000000000000000000044',
        validationTxs: ['0xvalpublic'],
      },
      trust: {
        score: 88,
        reason: 'registered provider with validation proofs',
        source: 'erc8004',
      },
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-public',
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
    async (profile) => ({
      providerId: profile.providerId,
      providerName: profile.displayName,
      endpoint: profile.endpoint,
      reachable: true,
      ready: false,
      missing: ['BOSSRAID_MODEL_API_KEY'],
      model: 'gpt-test',
      modelApiBase: 'https://example.invalid/v1',
      error: 'missing model key',
    })
  );
  const app = buildApiServer(orchestrator);

  try {
    const providersResponse = await app.inject({
      method: 'GET',
      url: '/v1/providers',
    });

    assert.equal(providersResponse.statusCode, 200);
    const [listedProvider] = providersResponse.json() as Array<Record<string, unknown>>;
    assert.equal(listedProvider?.providerId, 'provider-public');
    assert.equal(listedProvider?.endpoint, undefined);
    assert.equal(listedProvider?.auth, undefined);
    assert.equal(
      (listedProvider?.scores as { reputationScore?: number } | undefined)?.reputationScore,
      92
    );
    assert.equal(
      (listedProvider?.erc8004 as { agentId?: string } | undefined)?.agentId,
      'agent-provider-public'
    );
    assert.equal((listedProvider?.trust as { score?: number } | undefined)?.score, 88);

    const healthResponse = await app.inject({
      method: 'GET',
      url: '/v1/providers/health',
    });

    assert.equal(healthResponse.statusCode, 200);
    const [listedHealth] = healthResponse.json() as Array<Record<string, unknown>>;
    assert.equal(listedHealth?.providerId, 'provider-public');
    assert.equal(listedHealth?.providerName, 'provider-public');
    assert.equal(listedHealth?.endpoint, undefined);
    assert.equal(listedHealth?.missing, undefined);
    assert.equal(listedHealth?.modelApiBase, undefined);
    assert.equal(listedHealth?.error, undefined);
  } finally {
    await app.close();
  }
});

test('discover only returns providers that pass live readiness checks', async () => {
  const healthyProvider = {
    profile: createProviderProfile('provider-healthy'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-healthy',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };
  const coldProvider = {
    profile: createProviderProfile('provider-cold'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-cold',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [healthyProvider, coldProvider],
    {},
    undefined,
    undefined,
    async (profile) =>
      profile.providerId === 'provider-healthy'
        ? readyHealth(profile.providerId)
        : {
            providerId: profile.providerId,
            endpoint: profile.endpoint,
            reachable: true,
            ready: false,
            missing: ['BOSSRAID_MODEL'],
          }
  );
  const app = buildApiServer(orchestrator);

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/agents/discover',
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(
      response.json().map((provider: { providerId: string }) => provider.providerId),
      ['provider-healthy']
    );
  } finally {
    await app.close();
  }
});

test('provider-authenticated settlement route returns provider payout mirror data', async () => {
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-party-quest-settlement', {
      auth: {
        type: 'bearer',
        token: 'provider-token',
      },
      source: {
        type: 'party_quest',
        targetType: 'formation',
        externalRef: 'pqf-game-dev',
        displayIcon: 'fire-b-fill',
        memberCount: 3,
      },
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-party-quest-settlement',
      };
    },
    async run(task, callbacks): Promise<void> {
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-party-quest-settlement',
        providerRunId: 'run-party-quest-settlement',
        patchUnifiedDiff: [
          'diff --git a/src/components/Form.tsx b/src/components/Form.tsx',
          '--- a/src/components/Form.tsx',
          '+++ b/src/components/Form.tsx',
          '@@',
          '-  const disabled = true;',
          '+  const disabled = false;',
        ].join('\n'),
        answerText: 'Party Quest squad completed the raid work.',
        explanation: 'The exported formation produced a valid result.',
        confidence: 0.91,
        filesTouched: ['src/components/Form.tsx'],
        submittedAt: new Date().toISOString(),
      });
    },
  };
  const orchestrator = new BossRaidOrchestrator(
    [provider],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildApiServer(orchestrator);

  try {
    const spawn = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: createRaidRequestBody(),
    });
    assert.equal(spawn.statusCode, 200);
    const raidId = spawn.json().raidId as string;
    await waitFor(() => orchestrator.getResult(raidId).approvedSubmissions?.length === 1);

    const settlement = await app.inject({
      method: 'GET',
      url: `/v1/raid/${raidId}/provider-settlement?providerId=provider-party-quest-settlement`,
      headers: {
        authorization: 'Bearer provider-token',
      },
    });

    assert.equal(settlement.statusCode, 200);
    assert.equal(settlement.json().providerId, 'provider-party-quest-settlement');
    assert.equal(settlement.json().grossUsd, 10);
    assert.equal(settlement.json().valid, true);

    const providers = await app.inject({
      method: 'GET',
      url: '/v1/providers',
    });
    assert.equal(providers.json()[0].source.type, 'party_quest');
  } finally {
    await app.close();
  }
});
