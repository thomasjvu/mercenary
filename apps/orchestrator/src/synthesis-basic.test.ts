import assert from 'node:assert/strict';
import test from 'node:test';
import type { RaidProvider } from '@bossraid/provider-sdk';
import type { OutputType, ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import {
  createTestOrchestrator,
  createProviderProfile,
  createSpawnInput,
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

  const orchestrator = createTestOrchestrator([providerA, providerB]);

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
