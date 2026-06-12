import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaidProvider } from '@bossraid/provider-sdk';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { sanitizeTask } from '@bossraid/raid-core';
import { BossRaidOrchestrator } from './index.js';
import { buildHierarchicalRaidGraph } from './hierarchy.js';
import {
  createGameSpawnInput,
  createProviderProfile,
  createSpawnInput,
  FAST_TEST_TIMING,
  readyHealth,
  waitFor,
} from './index.test-helpers.js';

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
