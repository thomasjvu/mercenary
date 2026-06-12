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
  collectRaidTree,
  createProviderProfile,
  createSpawnInput,
  FAST_TEST_TIMING,
  readyHealth,
  waitFor,
} from './index.test-helpers.js';

test('Mercenary can revise the raid graph with an adaptive repair child raid', async () => {
  const receivedTasks: ProviderTaskPackage[] = [];
  const input = {
    ...createSpawnInput(),
    language: 'text' as const,
    framework: undefined,
    files: [],
    failingSignals: {
      errors: [],
      expectedBehavior: 'Explain the bug directly with caveats.',
    },
    output: {
      primaryType: 'text' as const,
      artifactTypes: ['text', 'json'] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      numExperts: 8,
      maxBudgetUsd: 24,
      requireSpecializations: [],
      allowedOutputTypes: ['text', 'json'] as OutputType[],
    },
  };

  const providers = [
    ...Array.from({ length: 7 }, (_, index): RaidProvider => {
      const providerId = `provider-adaptive-${index + 1}`;
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
          const isRiskScope = /Risk/i.test(task.synthesis?.workstreamLabel ?? '');
          await callbacks.onSubmit({
            raidId: task.raidId,
            providerId,
            providerRunId: `run-${providerId}`,
            answerText: isRiskScope
              ? 'short'
              : `Adaptive contribution ${index + 1} covers ${task.synthesis?.workstreamLabel ?? 'the task'}.`,
            explanation: isRiskScope
              ? 'too short'
              : `Adaptive contribution ${index + 1} adds valid coverage for ${task.synthesis?.workstreamLabel ?? 'the task'}.`,
            confidence: 0.8,
            filesTouched: [],
            submittedAt: new Date().toISOString(),
          });
        },
      };
    }),
    {
      profile: createProviderProfile('provider-adaptive-repair', {
        supportedLanguages: ['text'],
        supportedFrameworks: [],
        outputTypes: ['text', 'json'],
      }),
      async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: 'run-provider-adaptive-repair',
        };
      },
      async run(
        task: ProviderTaskPackage,
        callbacks: {
          onHeartbeat: (heartbeat: ProviderHeartbeat) => Promise<void>;
          onSubmit: (submission: ProviderSubmission) => Promise<void>;
          onFailure: (error: Error) => Promise<void>;
        }
      ): Promise<void> {
        receivedTasks.push(task);
        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId: 'provider-adaptive-repair',
          providerRunId: 'run-provider-adaptive-repair',
          answerText: `Repair contribution covers ${task.synthesis?.workstreamLabel ?? 'the missing scope'}.`,
          explanation:
            'This repair child fills the missing risk coverage after the first graph underperformed.',
          confidence: 0.88,
          filesTouched: [],
          submittedAt: new Date().toISOString(),
        });
      },
    },
  ];

  const orchestrator = new BossRaidOrchestrator(
    providers,
    FAST_TEST_TIMING,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );

  const spawn = await orchestrator.spawnRaid(input);
  await waitFor(() => orchestrator.getStatus(spawn.raidId).status === 'final', 10_000);

  const rootRaid = orchestrator.getRaid(spawn.raidId)!;
  const allRaids = collectRaidTree(orchestrator, spawn.raidId);
  const repairRaid = allRaids.find(
    (raid) => raid.contributionPlan?.roleLabel === 'Risk Core Repair'
  );

  assert.ok(repairRaid);
  assert.equal(repairRaid?.deadlineUnix, rootRaid.deadlineUnix);
  assert.equal(rootRaid.adaptivePlanning?.revisionCount, 1);
  assert.equal(rootRaid.adaptivePlanning?.history[0]?.workstreamId, 'risk-core');
  assert.equal(rootRaid.adaptivePlanning?.history[0]?.targetParentRaidId, repairRaid?.parentRaidId);
  assert.deepEqual(rootRaid.adaptivePlanning?.history[0]?.spawnedRaidIds, [repairRaid?.id]);
  assert.equal(receivedTasks.length, 8);
  assert.equal(orchestrator.getResult(spawn.raidId).approvedSubmissions?.length, 6);
});

test('Mercenary can deepen a weak workstream into an adaptive expansion subgraph', async () => {
  const receivedTasks: ProviderTaskPackage[] = [];
  const input = {
    ...createSpawnInput(),
    language: 'text' as const,
    framework: undefined,
    files: [],
    failingSignals: {
      errors: [],
      expectedBehavior: 'Explain the bug directly with risk coverage.',
    },
    output: {
      primaryType: 'text' as const,
      artifactTypes: ['text', 'json'] as OutputType[],
    },
    constraints: {
      ...createSpawnInput().constraints,
      numExperts: 10,
      maxBudgetUsd: 30,
      requireSpecializations: [],
      allowedOutputTypes: ['text', 'json'] as OutputType[],
    },
  };

  const providers = Array.from({ length: 10 }, (_, index): RaidProvider => {
    const providerId = `provider-adaptive-expand-${index + 1}`;
    const isAdaptiveReserve = index >= 8;

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
        const isRiskScope = /Risk/i.test(task.synthesis?.workstreamLabel ?? '');
        const invalidInitialRisk = isRiskScope && !isAdaptiveReserve;

        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId,
          providerRunId: `run-${providerId}`,
          answerText: invalidInitialRisk
            ? 'short'
            : `${providerId} covers ${task.synthesis?.workstreamLabel ?? 'the task'} with usable detail.`,
          explanation: invalidInitialRisk
            ? 'too short'
            : `${providerId} contributes valid coverage for ${task.synthesis?.workstreamLabel ?? 'the task'}.`,
          confidence: invalidInitialRisk ? 0.3 : 0.84,
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

  const rootRaid = orchestrator.getRaid(spawn.raidId)!;
  const allRaids = collectRaidTree(orchestrator, spawn.raidId);
  const expansionRaid = allRaids.find(
    (raid) => raid.contributionPlan?.roleLabel === 'Risk Core Expansion'
  );
  const expansionChildren = expansionRaid?.childRaidIds?.map(
    (childRaidId) => orchestrator.getRaid(childRaidId)!
  );
  const result = orchestrator.getResult(spawn.raidId);

  assert.ok(expansionRaid);
  assert.ok((expansionChildren?.length ?? 0) >= 2);
  assert.equal(expansionRaid?.deadlineUnix, rootRaid.deadlineUnix);
  assert.ok(expansionChildren?.every((raid) => raid.deadlineUnix === rootRaid.deadlineUnix));
  assert.equal(rootRaid.adaptivePlanning?.revisionCount, 1);
  assert.equal(rootRaid.adaptivePlanning?.history[0]?.strategy, 'expand');
  assert.equal(rootRaid.adaptivePlanning?.history[0]?.workstreamId, 'risk-core');
  assert.equal(
    rootRaid.adaptivePlanning?.history[0]?.targetParentRaidId,
    expansionRaid?.parentRaidId
  );
  assert.deepEqual(rootRaid.adaptivePlanning?.history[0]?.spawnedRaidIds, [expansionRaid?.id]);
  assert.equal(result.adaptivePlanning?.history[0]?.strategy, 'expand');
  assert.equal(result.adaptivePlanning?.remainingReserveExperts, 0);
  assert.equal(receivedTasks.length, 10);
  assert.ok(
    expansionChildren?.some((raid) =>
      /Risk Core|Risk Counterexamples/.test(raid.contributionPlan?.workstreamLabel ?? '')
    )
  );
  assert.ok(
    result.approvedSubmissions?.some((entry) =>
      entry.submission.contributionRole?.workstreamId?.startsWith('risk-')
    )
  );
});
