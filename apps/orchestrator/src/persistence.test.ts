import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FileBossRaidPersistence,
  InMemoryBossRaidPersistence,
  type BossRaidPersistence,
} from '@bossraid/persistence';
import { SqliteBossRaidPersistence } from '@bossraid/persistence-sqlite';
import type { RaidProvider } from '@bossraid/provider-sdk';
import type {
  ProviderAcceptance,
  ProviderHeartbeat,
  ProviderSubmission,
  ProviderTaskPackage,
  SettlementExecutionRecord,
} from '@bossraid/shared-types';
import { BossRaidOrchestrator } from './index.js';
import {
  collectRaidTree,
  createDeferred,
  createGameSpawnInput,
  createProviderProfile,
  createSpawnInput,
  FAST_TEST_TIMING,
  readyHealth,
  waitFor,
} from './index.test-helpers.js';

test('sqlite persistence saves and reloads snapshot state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bossraid-sqlite-test-'));
  const persistence = new SqliteBossRaidPersistence(join(dir, 'state.sqlite'));
  const snapshot = {
    version: 1 as const,
    savedAt: new Date().toISOString(),
    raids: [],
    providers: [createProviderProfile('provider-alpha')],
  };

  try {
    await persistence.saveState(snapshot);
    const loaded = await persistence.loadState();
    assert.deepEqual(loaded, snapshot);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('provider auth secrets are encrypted in persisted orchestrator snapshots', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bossraid-encrypted-provider-test-'));
  const stateFile = join(dir, 'state.json');
  const originalKey = process.env.BOSSRAID_SECRET_ENCRYPTION_KEY;
  const originalPreviousKeys = process.env.BOSSRAID_SECRET_ENCRYPTION_PREVIOUS_KEYS;
  process.env.BOSSRAID_SECRET_ENCRYPTION_KEY = 'unit-test-secret-key-old';
  delete process.env.BOSSRAID_SECRET_ENCRYPTION_PREVIOUS_KEYS;
  const persistence = new FileBossRaidPersistence(stateFile);
  const provider = createProviderProfile('provider-encrypted-auth', {
    auth: {
      type: 'bearer',
      token: 'super-secret-provider-token',
    },
  });
  const orchestrator = new BossRaidOrchestrator(
    [
      {
        profile: provider,
        async accept(): Promise<ProviderAcceptance> {
          return { accepted: true, providerRunId: 'run-encrypted-auth' };
        },
        async run(): Promise<void> {},
      },
    ],
    {},
    persistence
  );

  try {
    await orchestrator.persistState();
    const raw = await readFile(stateFile, 'utf8');
    assert.equal(raw.includes('super-secret-provider-token'), false);
    assert.equal(raw.includes('brenc:v1:'), true);

    process.env.BOSSRAID_SECRET_ENCRYPTION_KEY = 'unit-test-secret-key-new';
    process.env.BOSSRAID_SECRET_ENCRYPTION_PREVIOUS_KEYS = 'unit-test-secret-key-old';
    const restored = new BossRaidOrchestrator([], {}, persistence);
    restored.restoreState(await persistence.loadState());
    assert.equal(restored.listProviders()[0]?.auth?.token, 'super-secret-provider-token');

    await restored.persistState();
    const rotatedRaw = await readFile(stateFile, 'utf8');
    assert.equal(rotatedRaw.includes('super-secret-provider-token'), false);
    assert.equal(rotatedRaw.includes('brenc:v1:'), true);

    delete process.env.BOSSRAID_SECRET_ENCRYPTION_PREVIOUS_KEYS;
    const restoredAfterRotation = new BossRaidOrchestrator([], {}, persistence);
    restoredAfterRotation.restoreState(await persistence.loadState());
    assert.equal(
      restoredAfterRotation.listProviders()[0]?.auth?.token,
      'super-secret-provider-token'
    );
  } finally {
    if (originalKey == null) {
      delete process.env.BOSSRAID_SECRET_ENCRYPTION_KEY;
    } else {
      process.env.BOSSRAID_SECRET_ENCRYPTION_KEY = originalKey;
    }
    if (originalPreviousKeys == null) {
      delete process.env.BOSSRAID_SECRET_ENCRYPTION_PREVIOUS_KEYS;
    } else {
      process.env.BOSSRAID_SECRET_ENCRYPTION_PREVIOUS_KEYS = originalPreviousKeys;
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('restoreState merges persisted provider aliases into seeded providers by endpoint', () => {
  const orchestrator = new BossRaidOrchestrator([
    {
      profile: createProviderProfile('riko', {
        agentId: 'riko',
        displayName: 'Riko',
        endpoint: 'http://provider-b:9002',
        specializations: ['video-marketing', 'remotion'],
        outputTypes: ['video', 'text', 'bundle'],
      }),
      async accept(): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: 'run-riko',
        };
      },
      async run(): Promise<void> {
        return;
      },
    },
  ]);

  const normalized = orchestrator.restoreState({
    version: 1,
    savedAt: new Date().toISOString(),
    raids: [],
    providers: [
      createProviderProfile('minimal-diff-hunter', {
        agentId: 'minimal-diff-hunter',
        displayName: 'Riko',
        endpoint: 'http://provider-b:9002/',
        specializations: ['video-marketing', 'remotion', 'launch-copy'],
        outputTypes: ['video', 'text', 'bundle'],
        reputation: {
          globalScore: 0.77,
          responsivenessScore: 0.81,
          validityScore: 0.75,
          qualityScore: 0.8,
          timeoutRate: 0.09,
          duplicateRate: 0.03,
          specializationScores: { remotion: 0.9 },
          p50LatencyMs: 10_500,
          p95LatencyMs: 24_000,
          totalRaids: 21,
          totalSuccessfulRaids: 5,
        },
      }),
    ],
    launchReservations: [],
  });

  const providers = orchestrator.listProviders();
  assert.equal(normalized, true);
  assert.equal(providers.length, 1);
  assert.equal(providers[0]?.providerId, 'riko');
  assert.equal(providers[0]?.displayName, 'Riko');
  assert.equal(providers[0]?.reputation.totalRaids, 21);
});

test('upsertRegisteredProvider replaces aliased providers with the canonical agent id', async () => {
  const orchestrator = new BossRaidOrchestrator([
    {
      profile: createProviderProfile('minimal-diff-hunter', {
        agentId: 'minimal-diff-hunter',
        displayName: 'Riko',
        endpoint: 'http://provider-b:9002',
        outputTypes: ['video', 'text', 'bundle'],
      }),
      async accept(): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: 'run-riko',
        };
      },
      async run(): Promise<void> {
        return;
      },
    },
  ]);

  const provider = await orchestrator.upsertRegisteredProvider({
    agentId: 'riko',
    name: 'Riko',
    endpoint: 'http://provider-b:9002/',
    outputTypes: ['video', 'text', 'bundle'],
  });

  const providers = orchestrator.listProviders();
  assert.equal(provider.providerId, 'riko');
  assert.equal(providers.length, 1);
  assert.equal(providers[0]?.providerId, 'riko');
});

test('spawnRaid fails closed when persistence cannot save the new raid', async () => {
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-alpha'),
    async accept(): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-alpha',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };
  const failingPersistence: BossRaidPersistence = {
    async loadState() {
      return {
        version: 1,
        savedAt: new Date().toISOString(),
        raids: [],
        providers: [],
        launchReservations: [],
      };
    },
    async saveState() {
      throw new Error('disk full');
    },
  };
  const orchestrator = new BossRaidOrchestrator(
    [provider],
    undefined,
    failingPersistence,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );

  await assert.rejects(() => orchestrator.spawnRaid(createSpawnInput()), /disk full/);
});

test('restoreState preserves active raids and allows late provider submissions after restart', async () => {
  const persistence = new InMemoryBossRaidPersistence();
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-alpha'),
    async accept(): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-alpha',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };
  const original = new BossRaidOrchestrator(
    [provider],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 1_000,
      hardExecutionMs: 5_000,
      raidAbsoluteMs: 5_000,
    },
    persistence,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );

  const spawn = await original.spawnRaid(createSpawnInput());
  await waitFor(
    () =>
      original.getRaid(spawn.raidId)?.assignments['provider-alpha']?.providerRunId === 'run-alpha'
  );
  await original.persistState();

  const snapshot = await persistence.loadState();
  const restored = new BossRaidOrchestrator(
    [provider],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 1_000,
      hardExecutionMs: 5_000,
      raidAbsoluteMs: 5_000,
    },
    new InMemoryBossRaidPersistence(),
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );

  restored.restoreState(snapshot);
  await restored.resumeActiveRaids();

  assert.equal(restored.getStatus(spawn.raidId).status, 'running');

  const result = await restored.recordProviderSubmission(spawn.raidId, {
    raidId: spawn.raidId,
    providerId: 'provider-alpha',
    providerRunId: 'run-alpha',
    explanation: 'Fixed the disabled state after restore.',
    confidence: 0.93,
    filesTouched: ['src/components/Form.tsx'],
    patchUnifiedDiff: '--- a/src/components/Form.tsx',
    submittedAt: new Date().toISOString(),
  });

  assert.equal(result.status, 'final');
  assert.ok(result.rankedSubmissions);
  assert.equal(result.rankedSubmissions[0]?.submission.providerId, 'provider-alpha');
});

test('updateSettlementExecution persists refreshed settlement proof state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bossraid-sqlite-settlement-'));
  const persistence = new SqliteBossRaidPersistence(join(dir, 'state.sqlite'));
  const provider = {
    profile: createProviderProfile('provider-alpha'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-alpha',
      };
    },
    async run(
      task: ProviderTaskPackage,
      callbacks: {
        onHeartbeat: (heartbeat: ProviderHeartbeat) => void | Promise<void>;
        onSubmit: (submission: ProviderSubmission) => void | Promise<void>;
        onFailure: (error: Error) => void | Promise<void>;
      }
    ): Promise<void> {
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-alpha',
        providerRunId: 'run-alpha',
        explanation: 'Fixed the disabled state.',
        confidence: 0.91,
        filesTouched: ['src/components/Form.tsx'],
        patchUnifiedDiff: '--- a/src/components/Form.tsx',
        submittedAt: new Date().toISOString(),
      });
    },
  };
  const orchestrator = new BossRaidOrchestrator(
    [provider],
    FAST_TEST_TIMING,
    persistence,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );

  try {
    const spawn = await orchestrator.spawnRaid(createSpawnInput());
    await waitFor(() => orchestrator.getStatus(spawn.raidId).status === 'final');

    const settlementExecution: SettlementExecutionRecord = {
      mode: 'onchain',
      proofStandard: 'erc8183_aligned',
      lifecycleStatus: 'partial',
      executedAt: new Date().toISOString(),
      artifactPath: join(dir, 'raid_1.settlement.json'),
      registryRaidRef: '7',
      taskHash: '0xtaskhash',
      evaluationHash: '0xevaluationhash',
      successfulProviderIds: ['provider-alpha'],
      allocations: [
        {
          providerId: 'provider-alpha',
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
        rpcUrl: 'https://rpc.example',
      },
      registryCall: {
        method: 'finalizeRaid',
        args: ['7', '0xevaluationhash'],
      },
      childJobs: [
        {
          jobRef: `${spawn.raidId}:provider-alpha`,
          providerId: 'provider-alpha',
          providerAddress: '0x0000000000000000000000000000000000000106',
          role: 'successful',
          status: 'complete',
          requestedAction: 'complete',
          lifecycleStatus: 'submitted',
          budgetUsd: 10,
          budgetAtomic: '10000000',
          submitResultHash: '0xsubmissionhash',
          completionPolicy: 'submit and complete child job',
          nextAction:
            'Evaluator completion is still required from the configured evaluator wallet.',
          jobId: '9',
        },
      ],
      warnings: ['awaiting evaluator completion'],
    };

    await orchestrator.updateSettlementExecution(spawn.raidId, settlementExecution);

    const snapshot = await persistence.loadState();
    const persistedRaid = snapshot.raids.find((raid) => raid.id === spawn.raidId);
    assert.equal(persistedRaid?.settlementExecution?.mode, 'onchain');
    assert.equal(persistedRaid?.settlementExecution?.lifecycleStatus, 'partial');
    assert.equal(persistedRaid?.settlementExecution?.childJobs[0]?.lifecycleStatus, 'submitted');
    assert.equal(
      persistedRaid?.settlementExecution?.warnings?.[0],
      'awaiting evaluator completion'
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
