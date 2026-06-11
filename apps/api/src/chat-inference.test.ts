import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { buildApiServer, resolveChatTerminalSettleGraceMs } from './index.js';
import { createProviderProfile, readyHealth } from './test/helpers.js';

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
  const app = buildApiServer(orchestrator);

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

test('POST /v1/inference/chat/completions routes one model call to the cheapest seller', async () => {
  const receivedProviders: string[] = [];
  const cheapProvider: RaidProvider = {
    profile: createProviderProfile('provider-inference-cheap', {
      modelProvider: 'openai',
      modelId: 'gpt-5.5',
      pricePerTaskUsd: 0.25,
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-inference-cheap',
      };
    },
    async run(task, callbacks): Promise<void> {
      receivedProviders.push('provider-inference-cheap');
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-inference-cheap',
        providerRunId: 'run-inference-cheap',
        answerText: 'Cheap seller response.',
        explanation: 'The inference lane picked the cheapest eligible provider.',
        confidence: 0.9,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };
  const expensiveProvider: RaidProvider = {
    profile: createProviderProfile('provider-inference-expensive', {
      modelProvider: 'openai',
      modelId: 'gpt-5.5',
      pricePerTaskUsd: 1.25,
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-inference-expensive',
      };
    },
    async run(): Promise<void> {
      receivedProviders.push('provider-inference-expensive');
    },
  };
  const orchestrator = new BossRaidOrchestrator(
    [expensiveProvider, cheapProvider],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildApiServer(orchestrator);

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      payload: {
        model: 'gpt-5.5',
        messages: [
          {
            role: 'user',
            content: 'Answer with one sentence from the discount inference lane.',
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(receivedProviders, ['provider-inference-cheap']);
    assert.equal(response.json().raid.agents_invited, 1);
  } finally {
    await app.close();
  }
});

test('POST /v1/inference/chat/completions fails closed for strict Alkahest Gemma lane', async () => {
  const trustedButNotE2ee: RaidProvider = {
    profile: createProviderProfile('provider-strict-no-e2ee', {
      modelProvider: 'google',
      modelId: 'gemma-4-31b-it',
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
      pricing: {
        mode: 'token_metered',
        currency: 'USD',
        pricePer1mInputTokensUsd: 0.1,
        pricePer1mOutputTokensUsd: 0.2,
        minimumChargeUsd: 0.01,
        rateCardHash: 'strict-no-e2ee-rate-card',
      },
      verification: {
        status: 'verified',
        apiVerified: true,
        frameworkVerified: true,
        modelVerified: true,
      },
      privacy: {
        teeAttested: true,
        signedOutputs: true,
        noDataRetention: true,
      },
      erc8004: {
        agentId: '8004-no-e2ee',
        operatorWallet: '0x1111111111111111111111111111111111111111',
        registrationTx: '0xnoe2ee',
        identityRegistry: '0xidentityregistry',
      },
      trust: {
        score: 92,
        source: 'erc8004',
      },
    }),
    async accept(): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-strict-no-e2ee',
      };
    },
    async run(): Promise<void> {},
  };
  const orchestrator = new BossRaidOrchestrator(
    [trustedButNotE2ee],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildApiServer(orchestrator, {
    ...process.env,
    BOSSRAID_API_KEY: 'trusted-client-key',
    BOSSRAID_MANA_CORE_URL: 'https://mana.example.test',
    BOSSRAID_MANA_CORE_KEY: 'mana-core-key',
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: {
        authorization: 'Bearer trusted-client-key',
        'x-bossraid-client-id': 'alkahest',
        'x-bossraid-mana-account-id': 'mana_shared',
      },
      payload: {
        model: 'gemma-4-31b-it',
        max_tokens: 64,
        messages: [
          {
            role: 'user',
            content: 'Use the discounted strict Gemma lane.',
          },
        ],
      },
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.json().error, 'no_eligible_providers');
  } finally {
    await app.close();
  }
});
