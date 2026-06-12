import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { buildApiServer, resolveChatTerminalSettleGraceMs } from './index.js';
import { createTestApiServer, createProviderProfile, readyHealth } from './test/helpers.js';

test('chat completion requests require an explicit payout budget', async () => {
  const app = createTestApiServer();

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'user',
            content: 'Explain the bug.',
          },
        ],
      },
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: 'bad_request',
      message: 'Expected finite number for chat_completion_request.raid_policy.max_total_cost.',
    });
  } finally {
    await app.close();
  }
});

test('chat completion requests can use a server-side default payout budget', async () => {
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-chat-default-budget', {
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-chat-default-budget',
      };
    },
    async run(task, callbacks): Promise<void> {
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-chat-default-budget',
        providerRunId: 'run-chat-default-budget',
        answerText: 'The helper subtracts instead of adding.',
        explanation: 'Change subtraction back to addition.',
        confidence: 0.93,
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
  const app = buildApiServer(orchestrator, {
    ...process.env,
    BOSSRAID_CHAT_DEFAULT_MAX_TOTAL_COST: '15',
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'mercenary-v1',
        messages: [
          {
            role: 'user',
            content: 'Explain the bug.',
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().model, 'mercenary-v1');
  } finally {
    await app.close();
  }
});
