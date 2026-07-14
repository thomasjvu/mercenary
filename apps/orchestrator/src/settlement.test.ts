import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaidProvider } from '@bossraid/provider-sdk';
import type {
  ProviderAcceptance,
  ProviderHeartbeat,
  ProviderSubmission,
  ProviderTaskPackage,
  RaidRecord,
  RankedSubmission,
} from '@bossraid/shared-types';
import { computeRewards } from '@bossraid/raid-core';
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

test('equal split settlement pays the full budget across successful providers only', () => {
  const ranked: RankedSubmission[] = [
    {
      submission: {
        raidId: 'raid_1',
        providerId: 'provider-alpha',
        explanation: 'valid',
        confidence: 0.9,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
        answerText: 'answer',
      },
      breakdown: {
        schemaPass: true,
        patchApplyPass: true,
        buildScore: 1,
        testScore: 1,
        heuristicScore: 1,
        correctnessRubric: 1,
        sideEffectSafety: 1,
        explanationScore: 1,
        latencyScore: 1,
        uniquenessScore: 1,
        finalScore: 1,
        valid: true,
        invalidReasons: [],
      },
      rank: 1,
    },
    {
      submission: {
        raidId: 'raid_1',
        providerId: 'provider-bravo',
        explanation: 'valid',
        confidence: 0.9,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
        answerText: 'answer',
      },
      breakdown: {
        schemaPass: true,
        patchApplyPass: true,
        buildScore: 1,
        testScore: 1,
        heuristicScore: 1,
        correctnessRubric: 1,
        sideEffectSafety: 1,
        explanationScore: 1,
        latencyScore: 1,
        uniquenessScore: 1,
        finalScore: 1,
        valid: true,
        invalidReasons: [],
      },
      rank: 2,
    },
    {
      submission: {
        raidId: 'raid_1',
        providerId: 'provider-charlie',
        explanation: 'invalid',
        confidence: 0.4,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
        answerText: 'answer',
      },
      breakdown: {
        schemaPass: true,
        patchApplyPass: true,
        buildScore: 0.2,
        testScore: 0.2,
        heuristicScore: 0.2,
        correctnessRubric: 0.2,
        sideEffectSafety: 0.2,
        explanationScore: 0.2,
        latencyScore: 1,
        uniquenessScore: 1,
        finalScore: 0.2,
        valid: false,
        invalidReasons: ['below_threshold'],
      },
      rank: 3,
    },
  ];

  const rewards = computeRewards(12, ranked, { splitStrategy: 'equal_success_only' });
  assert.equal(rewards.successfulProviderCount, 2);
  assert.equal(rewards.payoutPerSuccessfulProvider, 6);
  assert.equal(rewards.successfulProvidersPaid, 12);
});

test('computeRewards always credits equal split (threshold does not zero rewards)', () => {
  const ranked = [
    {
      submission: {
        raidId: 'raid-1',
        providerId: 'provider-a',
        answerText: 'ok',
        explanation: 'ok',
        confidence: 0.9,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      },
      breakdown: {
        schemaPass: true,
        patchApplyPass: true,
        buildScore: 1,
        testScore: 1,
        heuristicScore: 1,
        correctnessRubric: 1,
        sideEffectSafety: 1,
        explanationScore: 1,
        latencyScore: 1,
        uniquenessScore: 1,
        finalScore: 0.9,
        valid: true,
        invalidReasons: [],
      },
      rank: 1,
    },
  ];

  const aboveThreshold = computeRewards(
    0.5,
    ranked,
    { splitStrategy: 'equal_success_only' },
    {
      minimumPayoutThresholdUsd: 1,
    }
  );
  assert.equal(aboveThreshold.payoutPerSuccessfulProvider, 0.5);

  // Sub-threshold amounts still accrue; $1 floor only gates batch flush.
  const belowThreshold = computeRewards(
    0.1,
    ranked,
    { splitStrategy: 'equal_success_only' },
    {
      minimumPayoutThresholdUsd: 1,
    }
  );
  assert.equal(belowThreshold.payoutPerSuccessfulProvider, 0.1);
  assert.equal(belowThreshold.successfulProvidersPaid, 0.1);
});

test('settlement execution receives registered provider operator wallets', async () => {
  const providerWallet = '0x0000000000000000000000000000000000000106';
  const settlementCalls: Array<{
    raid: RaidRecord;
    options?: { providerAddressMap?: Record<string, string | null | undefined> };
  }> = [];
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-alpha', {
      erc8004: {
        agentId: 'erc8004-provider-alpha',
        operatorWallet: providerWallet,
      },
    }),
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
    undefined,
    {
      execute: async (raid, options) => {
        settlementCalls.push({ raid, options });
        return undefined;
      },
      resume: async () => undefined,
    },
    async (profile) => readyHealth(profile.providerId)
  );

  const spawn = await orchestrator.spawnRaid(createSpawnInput());
  await waitFor(() => orchestrator.getStatus(spawn.raidId).status === 'final');

  assert.equal(settlementCalls.length, 1);
  assert.equal(settlementCalls[0]?.options?.providerAddressMap?.['provider-alpha'], providerWallet);
});
