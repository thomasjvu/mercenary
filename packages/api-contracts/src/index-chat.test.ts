import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  ApiContractError,
  buildBossRaidRequestFromChatCompletion,
  buildBossRaidRequestFromDelegateInput,
  parseChatCompletionRequest,
} from './index.js';

test('buildBossRaidRequestFromChatCompletion synthesizes the shared chat raid shape', () => {
  const request = buildBossRaidRequestFromChatCompletion(
    parseChatCompletionRequest({
      model: 'mercenary-v1',
      messages: [
        {
          role: 'system',
          content: 'Return one short sentence.',
        },
        {
          role: 'user',
          content: 'Inspect src/math.ts.',
        },
        {
          role: 'assistant',
          content: 'ignored',
        },
        {
          role: 'user',
          content: 'Explain the bug.',
        },
      ],
      raidPolicy: {
        maxAgents: '2',
        maxLatencySec: '45',
        maxTotalCost: '4.5',
        minReputationScore: '65',
        requireErc8004: true,
        minTrustScore: '72',
        allowedModelFamilies: ['gpt-4.1'],
        allowedAgentFrameworks: ['codex'],
        allowedModelProviders: ['openai'],
        allowedModelIds: ['gpt-5.5'],
        privacyMode: 'strict',
        requirePrivacyFeatures: ['signed_outputs'],
        selectionMode: 'round_robin',
      },
    })
  );

  assert.equal(request.agent, 'mercenary-v1');
  assert.equal(request.taskType, 'analysis');
  assert.equal(request.task.title, 'Explain the bug.');
  assert.equal(
    request.task.description,
    'System:\nReturn one short sentence.\n\nUser:\nInspect src/math.ts.\n\nAssistant:\nignored\n\nUser:\nExplain the bug.'
  );
  assert.equal(request.task.language, 'text');
  assert.deepEqual(request.task.failingSignals, {
    errors: [],
    expectedBehavior: 'Explain the bug.',
  });
  assert.deepEqual(request.output, {
    primaryType: 'text',
    artifactTypes: ['text', 'json'],
  });
  assert.deepEqual(request.raidPolicy, {
    maxAgents: 2,
    maxLatencySec: 45,
    maxTotalCost: 4.5,
    requiredCapabilities: undefined,
    requiredVerificationStatus: undefined,
    maxInputTokens: undefined,
    maxOutputTokens: undefined,
    minReputationScore: 65,
    requireErc8004: true,
    minTrustScore: 72,
    allowedModelFamilies: ['gpt-4.1'],
    allowedAgentFrameworks: ['codex'],
    allowedModelProviders: ['openai'],
    allowedModelIds: ['gpt-5.5'],
    allowedOutputTypes: ['text', 'json'],
    privacyMode: 'strict',
    requirePrivacyFeatures: ['signed_outputs'],
    selectionMode: 'round_robin',
  });
  assert.equal(request.hostContext?.host, 'codex');
});

test('buildBossRaidRequestFromChatCompletion requires an explicit payout budget', () => {
  assert.throws(
    () =>
      buildBossRaidRequestFromChatCompletion(
        parseChatCompletionRequest({
          model: 'mercenary-v1',
          messages: [
            {
              role: 'user',
              content: 'Explain the bug.',
            },
          ],
        })
      ),
    (error: unknown) =>
      error instanceof ApiContractError &&
      error.message ===
        'Expected finite number for chat_completion_request.raid_policy.max_total_cost.'
  );
});

test('buildBossRaidRequestFromChatCompletion accepts a server-side default payout budget and defaults chat routing to best_match', () => {
  const request = buildBossRaidRequestFromChatCompletion(
    parseChatCompletionRequest({
      model: 'mercenary-v1',
      messages: [
        {
          role: 'user',
          content: 'Explain the bug.',
        },
      ],
    }),
    {
      defaultMaxTotalCost: 6,
    }
  );

  assert.equal(request.raidPolicy?.maxTotalCost, 6);
  assert.equal(request.raidPolicy?.requiredCapabilities, undefined);
  assert.equal(request.raidPolicy?.selectionMode, 'best_match');
});

test('parseChatCompletionRequest rejects unsupported message roles', () => {
  assert.throws(
    () =>
      parseChatCompletionRequest({
        model: 'mercenary-v1',
        messages: [
          {
            role: 'tool',
            content: 'not supported',
          },
        ],
      }),
    (error: unknown) =>
      error instanceof ApiContractError &&
      error.message ===
        'Unsupported chat message role for chat_completion_request.messages[0].role.'
  );
});

test('buildBossRaidRequestFromDelegateInput infers code-task defaults and file hashes', () => {
  const request = buildBossRaidRequestFromDelegateInput({
    prompt: 'Patch the broken add helper.',
    system: 'Return a patch and short explanation.',
    files: [
      {
        path: 'src/math.ts',
        content: 'export function add(a: number, b: number) { return a - b; }\n',
      },
    ],
    maxAgents: '3',
    maxTotalCost: '7.5',
    minReputationScore: '55',
    requireErc8004: true,
    minTrustScore: '70',
    allowedModelFamilies: ['gpt-4.1'],
    privacyMode: 'prefer',
    requiredCapabilities: ['analysis', 'typescript'],
  });

  assert.equal(request.agent, 'mercenary-v1');
  assert.equal(request.taskType, 'code_task');
  assert.equal(request.task.title, 'Patch the broken add helper.');
  assert.equal(
    request.task.description,
    'Return a patch and short explanation.\n\nPatch the broken add helper.'
  );
  assert.equal(request.task.language, 'typescript');
  assert.deepEqual(request.output, {
    primaryType: 'patch',
    artifactTypes: ['patch', 'text'],
  });
  assert.equal(request.hostContext?.host, 'codex');
  assert.equal(request.raidPolicy?.maxAgents, 3);
  assert.equal(request.raidPolicy?.maxTotalCost, 7.5);
  assert.deepEqual(request.raidPolicy?.requiredCapabilities, ['analysis', 'typescript']);
  assert.equal(request.raidPolicy?.minReputationScore, 55);
  assert.equal(request.raidPolicy?.requireErc8004, true);
  assert.equal(request.raidPolicy?.minTrustScore, 70);
  assert.deepEqual(request.raidPolicy?.allowedModelFamilies, ['gpt-4.1']);
  assert.equal(request.raidPolicy?.privacyMode, 'prefer');
  assert.equal(request.raidPolicy?.allowedOutputTypes, undefined);
  assert.equal(request.raidPolicy?.requirePrivacyFeatures, undefined);
  assert.equal(request.raidPolicy?.selectionMode, undefined);
  assert.equal(request.task.files.length, 1);
  assert.equal(request.task.files[0]?.path, 'src/math.ts');
  assert.equal(
    request.task.files[0]?.sha256,
    createHash('sha256')
      .update('export function add(a: number, b: number) { return a - b; }\n')
      .digest('hex')
  );
});

test('buildBossRaidRequestFromDelegateInput rejects unsupported host values', () => {
  assert.throws(
    () =>
      buildBossRaidRequestFromDelegateInput({
        prompt: 'Explain the issue.',
        maxTotalCost: 2,
        hostContext: {
          host: 'unknown-host',
        },
      }),
    (error: unknown) =>
      error instanceof ApiContractError &&
      error.message === 'Unsupported host for hostContext.host.'
  );
});

test('buildBossRaidRequestFromDelegateInput requires an explicit payout budget', () => {
  assert.throws(
    () =>
      buildBossRaidRequestFromDelegateInput({
        prompt: 'Explain the issue.',
      }),
    (error: unknown) =>
      error instanceof ApiContractError &&
      error.message === 'Expected finite number for raidPolicy.maxTotalCost.'
  );
});
