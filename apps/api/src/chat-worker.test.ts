import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { buildTestApiServer, createProviderProfile, readyHealth } from './test/helpers.js';

test('POST /v1/chat/completions accepts general service routing filters', async () => {
  const receivedProviders: string[] = [];
  const matchingProvider: RaidProvider = {
    profile: createProviderProfile('provider-general-codex', {
      agentFramework: 'codex',
      modelProvider: 'openai',
      modelId: 'gpt-5.5',
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
      verification: {
        status: 'verified',
        apiVerified: true,
        frameworkVerified: true,
        modelVerified: true,
      },
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-general-codex',
      };
    },
    async run(task, callbacks): Promise<void> {
      receivedProviders.push('provider-general-codex');
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-general-codex',
        providerRunId: 'run-general-codex',
        answerText: 'Use the verified Codex provider.',
        explanation: 'The provider matches framework, model provider, model id, and budget.',
        confidence: 0.9,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };
  const nonMatchingProvider: RaidProvider = {
    profile: createProviderProfile('provider-general-claude', {
      agentFramework: 'claude_code',
      modelProvider: 'anthropic',
      modelId: 'claude-opus-4.1',
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-general-claude',
      };
    },
    async run(): Promise<void> {
      receivedProviders.push('provider-general-claude');
    },
  };
  const orchestrator = new BossRaidOrchestrator(
    [nonMatchingProvider, matchingProvider],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildTestApiServer(orchestrator);

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'mercenary-v1',
        messages: [
          {
            role: 'user',
            content: 'Route this through the preferred general service lane.',
          },
        ],
        raid_policy: {
          max_agents: 1,
          max_total_cost: 2,
          allowed_agent_frameworks: ['codex'],
          allowed_model_providers: ['openai'],
          allowed_model_ids: ['gpt-5.5'],
          selection_mode: 'round_robin',
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(receivedProviders, ['provider-general-codex']);
  } finally {
    await app.close();
  }
});
