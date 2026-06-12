import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaidProvider } from '@bossraid/provider-sdk';
import type {
  OutputType,
  ProviderAcceptance,
  ProviderHeartbeat,
  ProviderSubmission,
  ProviderTaskPackage,
} from '@bossraid/shared-types';
import { BossRaidOrchestrator } from './index.js';
import {
  createProviderProfile,
  createSpawnInput,
  FAST_TEST_TIMING,
  readyHealth,
  waitFor,
} from './index.test-helpers.js';

test('Mercenary can recurse into nested child raids when expert count exceeds the front layer', async () => {
  const receivedTasks: ProviderTaskPackage[] = [];
  const input = {
    ...createSpawnInput(),
    language: 'text' as const,
    framework: undefined,
    files: [],
    failingSignals: {
      errors: [],
      expectedBehavior: 'Explain the bug directly.',
    },
    output: {
      primaryType: 'text' as const,
      artifactTypes: ['text', 'json'] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      numExperts: 5,
      maxBudgetUsd: 20,
      requireSpecializations: [],
      allowedOutputTypes: ['text', 'json'] as OutputType[],
    },
  };

  const providers = Array.from({ length: 5 }, (_, index): RaidProvider => {
    const providerId = `provider-depth-${index + 1}`;
    return {
      profile: createProviderProfile(providerId, {
        supportedLanguages: ['text'],
        supportedFrameworks: [],
        outputTypes: ['text', 'json'],
      }),
      async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: `run-${providerId}`,
        };
      },
      async run(
        task: ProviderTaskPackage,
        callbacks: {
          onHeartbeat: (heartbeat: ProviderHeartbeat) => Promise<void> | void;
          onSubmit: (submission: ProviderSubmission) => Promise<void> | void;
          onFailure: (error: Error) => Promise<void> | void;
        }
      ): Promise<void> {
        receivedTasks.push(task);
        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId,
          providerRunId: `run-${providerId}`,
          answerText: `Contribution ${index + 1} explains the bug directly.`,
          explanation: `Contribution ${index + 1} adds enough detail for Mercenary to keep the synthesis graph stable.`,
          confidence: 0.8,
          filesTouched: [],
          submittedAt: new Date().toISOString(),
        });
      },
    };
  });

  const orchestrator = new BossRaidOrchestrator(
    providers,
    FAST_TEST_TIMING,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );

  const spawn = await orchestrator.spawnRaid(input);
  await waitFor(() => orchestrator.getStatus(spawn.raidId).status === 'final', 10_000);

  const nestedTaskRaid = receivedTasks
    .map((task) => orchestrator.getRaid(task.raidId))
    .find(
      (raid) =>
        raid?.parentRaidId && orchestrator.getRaid(raid.parentRaidId)?.parentRaidId === spawn.raidId
    );

  assert.equal(orchestrator.listRaids().length, 1);
  assert.equal(receivedTasks.length, 5);
  assert.ok(nestedTaskRaid);
  assert.equal(orchestrator.getResult(spawn.raidId).approvedSubmissions?.length, 5);
  assert.match(
    orchestrator.getResult(spawn.raidId).synthesizedOutput?.explanation ?? '',
    /workstreams/
  );
});

test('Mercenary can recurse across multiple child-raid levels for large expert swarms', async () => {
  const receivedTasks: ProviderTaskPackage[] = [];
  const expertCount = 20;
  const input = {
    ...createSpawnInput(),
    language: 'text' as const,
    framework: undefined,
    files: [],
    failingSignals: {
      errors: [],
      expectedBehavior: 'Explain the bug directly from many expert angles.',
    },
    output: {
      primaryType: 'text' as const,
      artifactTypes: ['text', 'json'] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      numExperts: expertCount,
      maxBudgetUsd: 80,
      requireSpecializations: [],
      allowedOutputTypes: ['text', 'json'] as OutputType[],
    },
  };

  const providers = Array.from({ length: expertCount }, (_, index): RaidProvider => {
    const providerId = `provider-depth-swarm-${index + 1}`;
    return {
      profile: createProviderProfile(providerId, {
        supportedLanguages: ['text'],
        supportedFrameworks: [],
        outputTypes: ['text', 'json'],
      }),
      async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: `run-${providerId}`,
        };
      },
      async run(task, callbacks): Promise<void> {
        receivedTasks.push(task);
        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId,
          providerRunId: `run-${providerId}`,
          answerText: `Swarm contribution ${index + 1} isolates one answer facet.`,
          explanation: `Swarm contribution ${index + 1} adds another scoped expert signal for Mercenary to synthesize.`,
          confidence: 0.78,
          filesTouched: [],
          submittedAt: new Date().toISOString(),
        });
      },
    };
  });

  const orchestrator = new BossRaidOrchestrator(
    providers,
    FAST_TEST_TIMING,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );

  const spawn = await orchestrator.spawnRaid(input);
  await waitFor(() => orchestrator.getStatus(spawn.raidId).status === 'final', 10_000);

  const maxDepth = Math.max(
    ...receivedTasks.map((task) => {
      let depth = 0;
      let current = orchestrator.getRaid(task.raidId);
      while (current) {
        depth += 1;
        current =
          current.parentRaidId == null ? undefined : orchestrator.getRaid(current.parentRaidId);
      }
      return depth;
    })
  );

  assert.ok(receivedTasks.length <= expertCount);
  assert.ok(maxDepth >= 3);
  assert.equal(
    orchestrator.getResult(spawn.raidId).approvedSubmissions?.length,
    receivedTasks.length
  );
});
