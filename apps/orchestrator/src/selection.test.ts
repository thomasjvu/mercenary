import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaidProvider } from '@bossraid/provider-sdk';
import type {
  BossRaidSpawnInput,
  OutputType,
  PrivacyFeatureKey,
  ProviderAcceptance,
  ProviderTaskPackage,
} from '@bossraid/shared-types';
import { selectProviders } from '@bossraid/raid-core';
import { BossRaidOrchestrator, NoEligibleProvidersError } from './index.js';
import { buildSettlementSummary } from './settlement.js';
import {
  collectRaidTree,
  createDeferred,
  createGameSpawnInput,
  createProviderProfile,
  createSpawnInput,
  readyHealth,
  waitFor,
} from './index.test-helpers.js';

test('selection respects the configured provider freshness window', () => {
  const task = createSpawnInput();
  const provider = {
    ...createProviderProfile('provider-alpha'),
    lastSeenAt: new Date(Date.now() - 90_000).toISOString(),
  };

  const strictSelection = selectProviders(task, [provider], 60_000);
  assert.equal(strictSelection.primaries.length, 0);

  const relaxedSelection = selectProviders(task, [provider], 120_000);
  assert.equal(relaxedSelection.primaries.length, 1);
  assert.equal(relaxedSelection.primaries[0]?.providerId, 'provider-alpha');
});

test('selection requires the requested primary output type', () => {
  const task = createSpawnInput();
  const provider = {
    ...createProviderProfile('provider-alpha'),
    outputTypes: ['text' as const],
  };

  const selection = selectProviders(task, [provider], 60_000);
  assert.equal(selection.primaries.length, 0);
});

test('selection can require ERC-8004 identity and a minimum trust score', () => {
  const task = {
    ...createSpawnInput(),
    constraints: {
      ...createSpawnInput().constraints,
      requireErc8004: true,
      minTrustScore: 70,
    },
  };
  const trustedProvider = {
    ...createProviderProfile('provider-trusted'),
    erc8004: {
      agentId: '8004-1',
      operatorWallet: '0xtrusted',
      registrationTx: '0xreg-trusted',
      identityRegistry: '0xidentity',
      reputationRegistry: '0xreputation',
    },
    trust: {
      score: 84,
      source: 'erc8004' as const,
    },
  };
  const unregisteredProvider = createProviderProfile('provider-unregistered');

  const selection = selectProviders(task, [unregisteredProvider, trustedProvider], 60_000);
  assert.equal(selection.primaries.length, 1);
  assert.equal(selection.primaries[0]?.providerId, 'provider-trusted');
});

test('selection can require verified provider status', () => {
  const task = {
    ...createSpawnInput(),
    constraints: {
      ...createSpawnInput().constraints,
      requiredVerificationStatus: 'verified' as const,
    },
  };
  const verifiedProvider = createProviderProfile('provider-verified-status', {
    verification: {
      status: 'verified',
      apiVerified: true,
      frameworkVerified: true,
      modelVerified: true,
    },
  });
  const pendingProvider = createProviderProfile('provider-pending-status', {
    verification: {
      status: 'pending',
    },
  });

  const selection = selectProviders(task, [pendingProvider, verifiedProvider], 60_000);
  assert.equal(selection.primaries.length, 1);
  assert.equal(selection.primaries[0]?.providerId, 'provider-verified-status');
});

test('reserved launch quotes fail closed after provider rate-card changes', async () => {
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-quoted-gemma', {
      modelFamily: 'venice',
      modelProvider: 'google',
      modelId: 'gemma-4-31b-it',
      supportedLanguages: ['text'],
      supportedFrameworks: [],
      outputTypes: ['text', 'json'],
      pricing: {
        mode: 'token_metered',
        currency: 'USD',
        pricePer1mInputTokensUsd: 0.08,
        pricePer1mOutputTokensUsd: 0.16,
        minimumChargeUsd: 0.01,
        rateCardVersion: 'gemma-discount-v1',
        rateCardHash: 'rate-card-v1',
        maxContextTokens: 131_072,
      },
      verification: {
        status: 'verified',
        apiVerified: true,
        frameworkVerified: true,
        modelVerified: true,
      },
      privacy: {
        teeAttested: true,
        e2ee: true,
        signedOutputs: true,
        noDataRetention: true,
      },
      erc8004: {
        agentId: '8004-quoted-gemma',
        operatorWallet: '0x3333333333333333333333333333333333333333',
        registrationTx: '0xquotedgemma',
        identityRegistry: '0xidentityregistry',
      },
      trust: {
        score: 91,
        source: 'erc8004',
      },
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-quoted-gemma',
      };
    },
    async run(): Promise<void> {},
  };
  const input: BossRaidSpawnInput = {
    ...createSpawnInput(),
    language: 'text',
    framework: undefined,
    files: [],
    output: {
      primaryType: 'text',
      artifactTypes: ['text', 'json'] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      numExperts: 1,
      maxBudgetUsd: 1,
      requireSpecializations: [],
      allowedOutputTypes: ['text', 'json'] as OutputType[],
      privacyMode: 'strict',
      requirePrivacyFeatures: [
        'tee_attested',
        'e2ee',
        'signed_outputs',
        'no_data_retention',
      ] as PrivacyFeatureKey[],
      requireErc8004: true,
      minTrustScore: 80,
      requiredVerificationStatus: 'verified',
      selectionMode: 'cost_first',
      maxOutputTokens: 64,
    },
  };
  const orchestrator = new BossRaidOrchestrator(
    [provider],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );

  const reservation = await orchestrator.reserveRaidLaunch(input, {
    route: 'chat',
    requestKey: 'strict-quote-1',
    holdUntilUnix: Math.floor(Date.now() / 1_000) + 60,
  });
  assert.equal(reservation.quoteSnapshot?.providers[0]?.rateCard.rateCardHash, 'rate-card-v1');

  const current = orchestrator.getProviderProfile('provider-quoted-gemma');
  assert.ok(current?.pricing);
  current.pricing = {
    ...current.pricing,
    pricePer1mOutputTokensUsd: 0.5,
    rateCardVersion: 'gemma-discount-v2',
    rateCardHash: 'rate-card-v2',
  };

  await assert.rejects(
    () => orchestrator.spawnReservedRaid(reservation.id, 'strict-quote-1'),
    /changed its rate card/
  );
});

test('strict privacy prefers Venice-backed providers when available', () => {
  const task = {
    ...createSpawnInput(),
    constraints: {
      ...createSpawnInput().constraints,
      privacyMode: 'strict' as const,
    },
  };
  const veniceProvider = createProviderProfile('provider-venice', {
    modelFamily: 'venice',
    privacy: {
      noDataRetention: true,
      teeAttested: true,
    },
  });
  const standardProvider = createProviderProfile('provider-standard', {
    privacy: {
      noDataRetention: true,
      teeAttested: true,
    },
    trust: {
      score: 99,
      source: 'erc8004' as const,
    },
  });

  const selection = selectProviders(task, [standardProvider, veniceProvider], 60_000);
  assert.equal(selection.primaries.length, 1);
  assert.equal(selection.primaries[0]?.providerId, 'provider-venice');
});

test('text-first game routing prefers the best domain-fit provider by default', () => {
  const task = {
    ...createSpawnInput(),
    taskTitle: 'Plan a one-room GB Studio microgame launch package',
    taskDescription:
      'Return a direct build summary for a playable GB Studio microgame with matching pixel-art and trailer support.',
    language: 'text' as const,
    framework: undefined,
    files: [],
    failingSignals: {
      errors: [],
      expectedBehavior:
        'Keep the answer scoped to the playable build, art pack, and trailer handoff.',
    },
    output: {
      primaryType: 'text' as const,
      artifactTypes: ['text', 'json'] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      allowedOutputTypes: ['text', 'json'] as OutputType[],
      selectionMode: 'best_match' as const,
    },
  };
  const gamma = createProviderProfile('provider-gamma', {
    specializations: ['gb-studio', 'gameplay'],
    supportedLanguages: ['text'],
    supportedFrameworks: ['gb-studio'],
    outputTypes: ['text', 'patch'],
  });
  const dottie = createProviderProfile('provider-dottie', {
    specializations: ['pixel-art', 'sprites'],
    supportedLanguages: ['text'],
    supportedFrameworks: [],
    outputTypes: ['text', 'image', 'bundle'],
    privacy: {
      noDataRetention: true,
      signedOutputs: true,
    },
  });
  const riko = createProviderProfile('provider-riko', {
    specializations: ['video-marketing', 'remotion'],
    supportedLanguages: ['text'],
    supportedFrameworks: [],
    outputTypes: ['text', 'video', 'bundle'],
  });

  const selection = selectProviders(task, [dottie, riko, gamma], 60_000);
  assert.equal(selection.primaries.length, 1);
  assert.equal(selection.primaries[0]?.providerId, 'provider-gamma');
});

test('explicit privacy_first still preserves privacy-led ordering for text chats', () => {
  const task = {
    ...createSpawnInput(),
    taskTitle: 'Plan a one-room GB Studio microgame launch package',
    taskDescription:
      'Return a direct build summary for a playable GB Studio microgame with matching pixel-art and trailer support.',
    language: 'text' as const,
    framework: undefined,
    files: [],
    failingSignals: {
      errors: [],
      expectedBehavior:
        'Keep the answer scoped to the playable build, art pack, and trailer handoff.',
    },
    output: {
      primaryType: 'text' as const,
      artifactTypes: ['text', 'json'] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      allowedOutputTypes: ['text', 'json'] as OutputType[],
      selectionMode: 'privacy_first' as const,
    },
  };
  const gamma = createProviderProfile('provider-gamma', {
    specializations: ['gb-studio', 'gameplay'],
    supportedLanguages: ['text'],
    supportedFrameworks: ['gb-studio'],
    outputTypes: ['text', 'patch'],
  });
  const dottie = createProviderProfile('provider-dottie', {
    specializations: ['pixel-art', 'sprites'],
    supportedLanguages: ['text'],
    supportedFrameworks: [],
    outputTypes: ['text', 'image', 'bundle'],
    privacy: {
      noDataRetention: true,
      teeAttested: true,
      signedOutputs: true,
    },
  });

  const selection = selectProviders(task, [gamma, dottie], 60_000);
  assert.equal(selection.primaries.length, 1);
  assert.equal(selection.primaries[0]?.providerId, 'provider-dottie');
});

test('provider selection filters by general agent service metadata', () => {
  const task = {
    ...createSpawnInput(),
    output: {
      primaryType: 'text' as const,
      artifactTypes: ['text', 'json'] as OutputType[],
    },
    language: 'text' as const,
    framework: undefined,
    constraints: {
      ...createSpawnInput().constraints,
      allowedOutputTypes: ['text', 'json'] as OutputType[],
      allowedAgentFrameworks: ['codex' as const],
      allowedModelProviders: ['openai'],
      allowedModelIds: ['gpt-5.5'],
    },
  };
  const claudeProvider = createProviderProfile('provider-claude', {
    agentFramework: 'claude_code',
    modelProvider: 'anthropic',
    modelId: 'claude-opus-4.1',
    supportedLanguages: ['text'],
    outputTypes: ['text', 'json'],
  });
  const codexProvider = createProviderProfile('provider-codex', {
    agentFramework: 'codex',
    modelProvider: 'openai',
    modelId: 'gpt-5.5',
    supportedLanguages: ['text'],
    outputTypes: ['text', 'json'],
  });

  const selection = selectProviders(task, [claudeProvider, codexProvider], 60_000);
  assert.equal(selection.primaries.length, 1);
  assert.equal(selection.primaries[0]?.providerId, 'provider-codex');
});

test('round_robin selection rotates among verified general service providers', () => {
  const task = {
    ...createSpawnInput(),
    output: {
      primaryType: 'text' as const,
      artifactTypes: ['text', 'json'] as OutputType[],
    },
    language: 'text' as const,
    framework: undefined,
    constraints: {
      ...createSpawnInput().constraints,
      allowedOutputTypes: ['text', 'json'] as OutputType[],
      selectionMode: 'round_robin' as const,
    },
  };
  const providerA = createProviderProfile('provider-rr-a', {
    supportedLanguages: ['text'],
    outputTypes: ['text', 'json'],
    verification: {
      status: 'verified',
      apiVerified: true,
      frameworkVerified: true,
      modelVerified: true,
    },
  });
  const providerB = createProviderProfile('provider-rr-b', {
    supportedLanguages: ['text'],
    outputTypes: ['text', 'json'],
    verification: {
      status: 'verified',
      apiVerified: true,
      frameworkVerified: true,
      modelVerified: true,
    },
  });

  let roundRobinCursor = 0;
  const firstSelection = selectProviders(task, [providerA, providerB], 60_000, {
    roundRobinCursor,
  });
  roundRobinCursor = firstSelection.roundRobinCursor ?? roundRobinCursor;
  const secondSelection = selectProviders(task, [providerA, providerB], 60_000, {
    roundRobinCursor,
  });
  const first = firstSelection.primaries[0]?.providerId;
  const second = secondSelection.primaries[0]?.providerId;
  assert.notEqual(first, second);
  assert.deepEqual(new Set([first, second]), new Set(['provider-rr-a', 'provider-rr-b']));
});

test('single-provider general service raids settle at the selected provider rate', async () => {
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-general-rate', {
      pricePerTaskUsd: 0.75,
      supportedLanguages: ['text'],
      outputTypes: ['text', 'json'],
      agentFramework: 'codex',
      modelProvider: 'openai',
      modelId: 'gpt-5.5',
      verification: {
        status: 'verified',
        apiVerified: true,
        frameworkVerified: true,
        modelVerified: true,
      },
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-general-rate',
      };
    },
    async run(task, callbacks): Promise<void> {
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-general-rate',
        providerRunId: 'run-general-rate',
        answerText: 'General service response.',
        explanation: 'Successful single-provider response.',
        confidence: 0.9,
        filesTouched: [],
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
  const spawn = await orchestrator.spawnRaid({
    ...createSpawnInput(),
    language: 'text',
    framework: undefined,
    files: [],
    output: {
      primaryType: 'text',
      artifactTypes: ['text', 'json'],
    },
    constraints: {
      ...createSpawnInput().constraints,
      maxBudgetUsd: 5,
      allowedOutputTypes: ['text', 'json'],
      allowedAgentFrameworks: ['codex'],
      allowedModelProviders: ['openai'],
      allowedModelIds: ['gpt-5.5'],
      selectionMode: 'round_robin',
    },
  });

  await waitFor(() => orchestrator.getRaid(spawn.raidId)?.status === 'final');
  const raid = orchestrator.getRaid(spawn.raidId);
  assert.ok(raid);
  const settlement = buildSettlementSummary(raid);
  assert.equal(settlement?.payoutPerSuccessfulProvider, 0.75);
  assert.equal(settlement?.successfulProvidersPaid, 0.75);
});

test('provider selection respects active maxConcurrency across raids', async () => {
  const hold = new Promise<void>(() => {});
  let runCalls = 0;

  const provider = {
    profile: createProviderProfile('provider-alpha'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: `run-${Date.now()}`,
      };
    },
    async run(): Promise<void> {
      runCalls += 1;
      return hold;
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [{ ...provider, profile: { ...provider.profile, maxConcurrency: 1 } }],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 10_000,
      hardExecutionMs: 100_000,
      raidAbsoluteMs: 100_000,
    },
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );

  await orchestrator.spawnRaid(createSpawnInput());
  await waitFor(() => runCalls === 1);

  await assert.rejects(() => orchestrator.spawnRaid(createSpawnInput()), NoEligibleProvidersError);
});
