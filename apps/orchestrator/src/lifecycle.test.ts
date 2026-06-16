import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ProviderAcceptance,
  ProviderHeartbeat,
  ProviderSubmission,
  ProviderTaskPackage,
} from '@bossraid/shared-types';
import { BossRaidOrchestrator, NoEligibleProvidersError } from './index.js';
import {
  createTestOrchestrator,
  collectRaidTree,
  createDeferred,
  createGameSpawnInput,
  createProviderProfile,
  createSpawnInput,
  FAST_TEST_TIMING,
  readyHealth,
  waitFor,
} from './index.test-helpers.js';

test('spawnRaid fails fast when no providers are eligible', async () => {
  const orchestrator = new BossRaidOrchestrator();

  await assert.rejects(() => orchestrator.spawnRaid(createSpawnInput()), NoEligibleProvidersError);
});

test('cancelled raids ignore late provider activity', async () => {
  const acceptance = createDeferred<ProviderAcceptance>();
  let acceptStarted = false;

  const provider = {
    profile: createProviderProfile('provider-alpha'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      acceptStarted = true;
      return acceptance.promise;
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = createTestOrchestrator([provider]);

  const spawn = await orchestrator.spawnRaid(createSpawnInput());
  await waitFor(() => acceptStarted);
  assert.equal(
    spawn.receiptPath,
    `/verification?raidId=${spawn.raidId}&token=${spawn.raidAccessToken}`
  );

  const cancelled = orchestrator.abortRaid(spawn.raidId);
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(cancelled.experts[0]?.status, 'disqualified');

  acceptance.resolve({
    accepted: true,
    providerRunId: 'run-late',
  });

  await new Promise((resolve) => setTimeout(resolve, 25));

  const lateHeartbeat: ProviderHeartbeat = {
    raidId: spawn.raidId,
    providerId: 'provider-alpha',
    providerRunId: 'run-late',
    progress: 0.8,
    message: 'late heartbeat',
    timestamp: new Date().toISOString(),
  };
  const heartbeatStatus = orchestrator.recordProviderHeartbeat(
    spawn.raidId,
    'provider-alpha',
    lateHeartbeat
  );
  assert.equal(heartbeatStatus.status, 'cancelled');
  assert.equal(heartbeatStatus.experts[0]?.status, 'disqualified');

  const lateSubmission: ProviderSubmission = {
    raidId: spawn.raidId,
    providerId: 'provider-alpha',
    patchUnifiedDiff: [
      '--- a/src/components/Form.tsx',
      '+++ b/src/components/Form.tsx',
      '@@',
      '-  const disabled = true;',
      '+  const disabled = false;',
    ].join('\n'),
    explanation: 'Late submission that should be ignored after cancellation.',
    confidence: 0.9,
    filesTouched: ['src/components/Form.tsx'],
    submittedAt: new Date().toISOString(),
  };
  const result = await orchestrator.recordProviderSubmission(spawn.raidId, lateSubmission);
  assert.equal(result.status, 'cancelled');
  assert.equal(result.approvedSubmissions?.length ?? 0, 0);
  assert.equal(result.primarySubmission, undefined);

  const finalStatus = orchestrator.getStatus(spawn.raidId);
  assert.equal(finalStatus.status, 'cancelled');
  assert.equal(finalStatus.experts[0]?.status, 'disqualified');
});

test('spawnRaid filters out providers that are reachable but not ready', async () => {
  let acceptCalls = 0;

  const provider = {
    profile: createProviderProfile('provider-alpha'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      acceptCalls += 1;
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
    {},
    undefined,
    undefined,
    async (profile) => ({
      providerId: profile.providerId,
      endpoint: profile.endpoint,
      reachable: true,
      ready: false,
      missing: ['BOSSRAID_MODEL_API_KEY'],
    })
  );

  await assert.rejects(() => orchestrator.spawnRaid(createSpawnInput()), NoEligibleProvidersError);
  assert.equal(acceptCalls, 0);
  assert.equal(orchestrator.listProviders()[0]?.status, 'degraded');
});

test('heartbeat stale timeout expires runs that stop heartbeating', async () => {
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
      heartbeatStaleMs: 50,
      hardExecutionMs: 1_000,
      raidAbsoluteMs: 1_000,
    },
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );

  const spawn = await orchestrator.spawnRaid(createSpawnInput());

  await waitFor(
    () =>
      orchestrator.getRaid(spawn.raidId)?.assignments['provider-alpha']?.providerRunId ===
      'run-alpha'
  );

  orchestrator.recordProviderHeartbeat(spawn.raidId, 'provider-alpha', {
    raidId: spawn.raidId,
    providerId: 'provider-alpha',
    providerRunId: 'run-alpha',
    progress: 0.5,
    message: 'working',
    timestamp: new Date().toISOString(),
  });

  await waitFor(
    () => orchestrator.getRaid(spawn.raidId)?.assignments['provider-alpha']?.status === 'timed_out'
  );

  const status = orchestrator.getStatus(spawn.raidId);
  assert.equal(status.experts[0]?.status, 'timed_out');
  assert.match(status.experts[0]?.message ?? '', /heartbeat stale/i);
});

test('absolute raid deadline disqualifies non-responding providers and penalizes routing', async () => {
  const provider = {
    profile: createProviderProfile('provider-alpha'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-alpha',
      };
    },
    async run(): Promise<void> {
      return new Promise(() => {});
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 5_000,
      hardExecutionMs: 5_000,
      raidAbsoluteMs: 50,
    },
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );

  const spawn = await orchestrator.spawnRaid(createSpawnInput());
  await waitFor(() => orchestrator.getStatus(spawn.raidId).status === 'final');

  const status = orchestrator.getStatus(spawn.raidId);
  assert.equal(status.status, 'final');
  assert.equal(status.experts[0]?.status, 'disqualified');
  assert.match(status.experts[0]?.message ?? '', /raid deadline reached/i);

  const providerAfter = orchestrator.listProviders()[0];
  assert.ok(providerAfter);
  assert.equal(providerAfter?.reputation.responsivenessScore, 0.85);
  assert.equal(providerAfter?.reputation.globalScore, 0.88);
});
