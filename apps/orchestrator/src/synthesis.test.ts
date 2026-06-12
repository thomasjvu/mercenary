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
import { sanitizeTask } from '@bossraid/raid-core';
import { BossRaidOrchestrator } from './index.js';
import { buildHierarchicalRaidGraph } from './hierarchy.js';
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

test('Mercenary synthesizes approved provider contributions into one canonical result', async () => {
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
      numExperts: 2,
      maxBudgetUsd: 10,
      requireSpecializations: [],
      allowedOutputTypes: ['text', 'json'] as OutputType[],
    },
  };
  const receivedTasks: ProviderTaskPackage[] = [];

  const providerA: RaidProvider = {
    profile: createProviderProfile('provider-alpha', {
      supportedLanguages: ['text'],
      supportedFrameworks: [],
      outputTypes: ['text', 'json'],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-alpha',
      };
    },
    async run(task, callbacks): Promise<void> {
      receivedTasks.push(task);
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-alpha',
        providerRunId: 'run-alpha',
        answerText: 'The add helper subtracts instead of adding.',
        explanation: 'The return expression uses subtraction, which flips every sum.',
        confidence: 0.91,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };

  const providerB: RaidProvider = {
    profile: createProviderProfile('provider-bravo', {
      supportedLanguages: ['text'],
      supportedFrameworks: [],
      outputTypes: ['text', 'json'],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-bravo',
      };
    },
    async run(task, callbacks): Promise<void> {
      receivedTasks.push(task);
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-bravo',
        providerRunId: 'run-bravo',
        answerText: 'The helper returns a - b, so the output is inverted.',
        explanation: 'Switch the arithmetic back to addition.',
        confidence: 0.87,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [providerA, providerB],
    FAST_TEST_TIMING,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );

  const spawn = await orchestrator.spawnRaid(input);
  await waitFor(() => orchestrator.getStatus(spawn.raidId).status === 'final');

  const result = orchestrator.getResult(spawn.raidId);
  assert.equal(orchestrator.listRaids().length, 1);
  assert.equal(receivedTasks.length, 2);
  assert.notEqual(receivedTasks[0]?.raidId, spawn.raidId);
  assert.notEqual(receivedTasks[1]?.raidId, spawn.raidId);
  assert.equal(orchestrator.getRaid(receivedTasks[0]!.raidId)?.parentRaidId, spawn.raidId);
  assert.equal(orchestrator.getRaid(receivedTasks[1]!.raidId)?.parentRaidId, spawn.raidId);
  assert.equal(result.approvedSubmissions?.length, 2);
  assert.equal(result.synthesizedOutput?.mode, 'multi_agent_synthesis');
  assert.equal(result.synthesizedOutput?.contributingProviderIds.length, 2);
  assert.equal(result.synthesizedOutput?.workstreams.length, 2);
  assert.match(receivedTasks[0]?.synthesis?.focus ?? '', /button state bug/i);
  assert.match(receivedTasks[0]?.synthesis?.workstreamObjective ?? '', /button state bug/i);
  assert.match(receivedTasks[1]?.synthesis?.focus ?? '', /button state bug/i);
  assert.deepEqual(
    result.synthesizedOutput?.workstreams.map((item) => item.label),
    ['Answer', 'Risk']
  );
  assert.notEqual(
    result.approvedSubmissions?.[0]?.submission.contributionRole?.label,
    result.approvedSubmissions?.[1]?.submission.contributionRole?.label
  );
  assert.notEqual(
    result.approvedSubmissions?.[0]?.submission.contributionRole?.workstreamLabel,
    result.approvedSubmissions?.[1]?.submission.contributionRole?.workstreamLabel
  );
  assert.doesNotMatch(result.synthesizedOutput?.answerText ?? '', /Supporting workstreams:/);
  assert.doesNotMatch(result.synthesizedOutput?.answerText ?? '', /Risk:/);
  assert.match(
    result.synthesizedOutput?.answerText ?? '',
    /subtracts instead of adding|returns a - b/
  );
  assert.doesNotMatch(result.synthesizedOutput?.explanation ?? '', /Supporting workstreams:/);
  assert.ok(
    result.synthesizedOutput?.workstreams.every((item) => (item.shortSummary?.length ?? 0) > 0)
  );
  assert.doesNotMatch(result.synthesizedOutput?.workstreams[0]?.shortSummary ?? '', /Artifacts:/);
});

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

test('Mercenary routes game raids into gameplay, pixel art, and video marketing workstreams', async () => {
  const receivedTasks: Array<{ providerId: string; task: ProviderTaskPackage }> = [];
  const input = createGameSpawnInput();

  const providers: RaidProvider[] = [
    {
      profile: createProviderProfile('provider-gamma', {
        specializations: ['gb-studio', 'gameplay'],
        supportedLanguages: ['typescript'],
        supportedFrameworks: ['gb-studio'],
        outputTypes: ['patch', 'text'],
      }),
      async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: 'run-provider-gamma',
        };
      },
      async run(task, callbacks): Promise<void> {
        receivedTasks.push({ providerId: 'provider-gamma', task });
        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId: 'provider-gamma',
          providerRunId: 'run-provider-gamma',
          patchUnifiedDiff: [
            '--- a/game/project.gbsproj',
            '+++ b/game/project.gbsproj',
            '@@',
            '+"bossIntro": true',
          ].join('\n'),
          explanation: 'Adds the playable boss intro scene and hooks.',
          confidence: 0.92,
          filesTouched: ['game/project.gbsproj'],
          submittedAt: new Date().toISOString(),
        });
      },
    },
    {
      profile: createProviderProfile('provider-dottie', {
        specializations: ['pixel-art', 'sprites'],
        supportedLanguages: ['text'],
        supportedFrameworks: [],
        outputTypes: ['image', 'text', 'bundle'],
      }),
      async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: 'run-provider-dottie',
        };
      },
      async run(task, callbacks): Promise<void> {
        receivedTasks.push({ providerId: 'provider-dottie', task });
        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId: 'provider-dottie',
          providerRunId: 'run-provider-dottie',
          artifacts: [
            {
              outputType: 'image',
              label: 'Boss sprite sheet',
              uri: 'https://example.com/art/boss-spritesheet.png',
              mimeType: 'image/png',
              description: 'Hero, boss, arena tiles, and UI frame in one preview sheet.',
            },
          ],
          explanation: 'Defines the pixel-art handoff the builder needs.',
          confidence: 0.88,
          filesTouched: [],
          submittedAt: new Date().toISOString(),
        });
      },
    },
    {
      profile: createProviderProfile('provider-riko', {
        specializations: ['remotion', 'motion-design'],
        supportedLanguages: ['text'],
        supportedFrameworks: [],
        outputTypes: ['video', 'text'],
      }),
      async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
        return {
          accepted: true,
          providerRunId: 'run-provider-riko',
        };
      },
      async run(task, callbacks): Promise<void> {
        receivedTasks.push({ providerId: 'provider-riko', task });
        await callbacks.onSubmit({
          raidId: task.raidId,
          providerId: 'provider-riko',
          providerRunId: 'run-provider-riko',
          artifacts: [
            {
              outputType: 'video',
              label: 'Boss intro trailer',
              uri: 'https://example.com/video/boss-intro.mp4',
              mimeType: 'video/mp4',
              description: 'Title card, boss reveal, gameplay beat, and CTA.',
            },
          ],
          explanation: 'Provides the trailer angle and launch copy.',
          confidence: 0.86,
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

  const result = orchestrator.getResult(spawn.raidId);
  const childRaids = orchestrator
    .getRaid(spawn.raidId)!
    .childRaidIds!.map((childRaidId) => orchestrator.getRaid(childRaidId)!);

  assert.equal(receivedTasks.length, 3);
  assert.deepEqual(
    childRaids
      .map((raid) => ({
        workstream: raid.contributionPlan?.workstreamLabel,
        primaryType: raid.task.output?.primaryType,
        requiredSpecializations: raid.task.constraints.requireSpecializations,
      }))
      .sort((left, right) => String(left.workstream).localeCompare(String(right.workstream))),
    [
      {
        workstream: 'Gameplay',
        primaryType: 'patch',
        requiredSpecializations: ['gb-studio'],
      },
      {
        workstream: 'Pixel Art',
        primaryType: 'image',
        requiredSpecializations: ['pixel-art'],
      },
      {
        workstream: 'Video Marketing',
        primaryType: 'video',
        requiredSpecializations: ['remotion'],
      },
    ]
      .map((entry) => entry)
      .sort((left, right) => left.workstream.localeCompare(right.workstream))
  );
  assert.deepEqual(
    receivedTasks
      .map(({ providerId, task }) => ({
        providerId,
        workstream: task.synthesis?.workstreamLabel,
        primaryType: task.desiredOutput.primaryType,
      }))
      .sort((left, right) => left.providerId.localeCompare(right.providerId)),
    [
      {
        providerId: 'provider-dottie',
        workstream: 'Pixel Art',
        primaryType: 'image',
      },
      {
        providerId: 'provider-gamma',
        workstream: 'Gameplay',
        primaryType: 'patch',
      },
      {
        providerId: 'provider-riko',
        workstream: 'Video Marketing',
        primaryType: 'video',
      },
    ]
  );
  assert.deepEqual(
    [...(result.synthesizedOutput?.workstreams.map((item) => item.label) ?? [])].sort(),
    ['Gameplay', 'Pixel Art', 'Video Marketing'].sort()
  );
  assert.deepEqual(
    result.synthesizedOutput?.workstreams
      .map((item) => ({ label: item.label, primaryType: item.primaryType }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    [
      { label: 'Gameplay', primaryType: 'patch' },
      { label: 'Pixel Art', primaryType: 'image' },
      { label: 'Video Marketing', primaryType: 'video' },
    ]
  );
  assert.deepEqual(
    result.synthesizedOutput?.artifacts?.map((artifact) => artifact.outputType).sort(),
    ['image', 'video']
  );
  assert.equal(result.approvedSubmissions?.length, 3);
});

test('Mercenary uses nested game-specific workstream families for larger game swarms', () => {
  const graph = buildHierarchicalRaidGraph(
    sanitizeTask({
      ...createGameSpawnInput(),
      constraints: {
        ...createGameSpawnInput().constraints,
        numExperts: 5,
        maxBudgetUsd: 20,
      },
    })
  );

  const topLevelLabels =
    graph.children?.map((child) => child.contributionPlan?.workstreamLabel) ?? [];
  const gameplayNode = graph.children?.find(
    (child) => child.contributionPlan?.workstreamLabel === 'Gameplay'
  );
  const artNode = graph.children?.find(
    (child) => child.contributionPlan?.workstreamLabel === 'Pixel Art'
  );
  const promoNode = graph.children?.find(
    (child) => child.contributionPlan?.workstreamLabel === 'Video Marketing'
  );

  assert.deepEqual(topLevelLabels, ['Gameplay', 'Pixel Art', 'Video Marketing']);
  assert.deepEqual(gameplayNode?.task.constraints.requireSpecializations, ['gb-studio']);
  assert.equal(gameplayNode?.task.output?.primaryType, 'patch');
  assert.ok(
    gameplayNode?.children?.some((child) =>
      /Gameplay Core|Gameplay QA/.test(child.contributionPlan?.workstreamLabel ?? '')
    )
  );
  assert.deepEqual(artNode?.task.constraints.requireSpecializations, ['pixel-art']);
  assert.equal(artNode?.task.output?.primaryType, 'image');
  assert.deepEqual(artNode?.task.output?.artifactTypes, ['image', 'text', 'bundle']);
  assert.equal(artNode?.task.language, 'text');
  assert.equal(artNode?.task.framework, undefined);
  assert.ok(
    artNode?.children?.some((child) =>
      /Art Direction|Asset Pack/.test(child.contributionPlan?.workstreamLabel ?? '')
    )
  );
  assert.deepEqual(promoNode?.task.constraints.requireSpecializations, ['remotion']);
  assert.equal(promoNode?.task.output?.primaryType, 'video');
  assert.deepEqual(promoNode?.task.output?.artifactTypes, ['video', 'text']);
  assert.equal(promoNode?.task.language, 'text');
});

test('text-first game chats bias answer, constraints, and risk toward gameplay, art, and promo specialists', () => {
  const graph = buildHierarchicalRaidGraph(
    sanitizeTask({
      ...createSpawnInput(),
      taskTitle: 'Plan a one-room GB Studio microgame launch package',
      taskDescription:
        'Return a direct build summary for a playable GB Studio microgame with matching pixel-art and trailer support.',
      language: 'text',
      framework: undefined,
      files: [],
      failingSignals: {
        errors: [],
        expectedBehavior:
          'Keep the answer scoped to the playable build, art pack, and trailer handoff.',
      },
      output: {
        primaryType: 'text',
        artifactTypes: ['text', 'json'],
      },
      constraints: {
        ...createSpawnInput().constraints,
        numExperts: 3,
        allowedOutputTypes: ['text', 'json'],
        selectionMode: 'best_match',
      },
    })
  );

  const answerNode = graph.children?.find(
    (child) => child.contributionPlan?.workstreamLabel === 'Answer'
  );
  const constraintsNode = graph.children?.find(
    (child) => child.contributionPlan?.workstreamLabel === 'Constraints'
  );
  const riskNode = graph.children?.find(
    (child) => child.contributionPlan?.workstreamLabel === 'Risk'
  );

  assert.deepEqual(answerNode?.task.constraints.requireSpecializations, ['gb-studio']);
  assert.deepEqual(constraintsNode?.task.constraints.requireSpecializations, ['pixel-art']);
  assert.deepEqual(riskNode?.task.constraints.requireSpecializations, ['remotion']);
});

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
