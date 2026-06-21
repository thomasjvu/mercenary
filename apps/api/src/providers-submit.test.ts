import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { NETWORK } from '@bossraid/constants';
import { buildTestApiServer } from './test/helpers.js';
import {
  createTestOrchestrator,
  createProviderProfile,
  createRaidRequestBody,
  FAST_TEST_TIMING,
  readyHealth,
  waitFor,
} from './test/helpers.js';

test('provider submit requires the active providerRunId', async () => {
  const provider = {
    profile: createProviderProfile('provider-alpha'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-alpha',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = createTestOrchestrator([provider]);
  const spawn = await orchestrator.spawnRaid({
    taskTitle: 'Summarize the memo',
    taskDescription: 'Review the memo and summarize the main risks.',
    language: 'text',
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: 'text',
      artifactTypes: ['text'],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ['analysis'],
      minReputation: 0,
      allowedOutputTypes: ['text'],
      privacyMode: 'prefer',
    },
    rewardPolicy: {
      splitStrategy: 'equal_success_only',
    },
    privacyMode: {
      redactSecrets: true,
      redactIdentifiers: true,
      allowFullRepo: false,
    },
    hostContext: {
      host: 'codex',
    },
  });

  await waitFor(
    () =>
      orchestrator.getRaid(spawn.raidId)?.assignments['provider-alpha']?.providerRunId ===
      'run-alpha'
  );

  const app = buildTestApiServer(orchestrator);

  try {
    const missingRunId = await app.inject({
      method: 'POST',
      url: '/v1/providers/provider-alpha/submit',
      payload: {
        raidId: spawn.raidId,
        answerText: 'Main risk is stale provider state.',
        explanation: 'The memo points to stale routing state as the main system risk.',
        confidence: 0.8,
        filesTouched: [],
      },
    });

    assert.equal(missingRunId.statusCode, 409);
    assert.equal(missingRunId.json().error, 'provider_run_required');

    const wrongRunId = await app.inject({
      method: 'POST',
      url: '/v1/providers/provider-alpha/submit',
      payload: {
        raidId: spawn.raidId,
        providerRunId: 'run-wrong',
        answerText: 'Main risk is stale provider state.',
        explanation: 'The memo points to stale routing state as the main system risk.',
        confidence: 0.8,
        filesTouched: [],
      },
    });

    assert.equal(wrongRunId.statusCode, 409);
    assert.equal(wrongRunId.json().error, 'provider_run_mismatch');
  } finally {
    await app.close();
  }
});

test('provider callbacks accept custom bearer header names', async () => {
  const provider = {
    profile: createProviderProfile('provider-custom-auth', {
      auth: {
        type: 'bearer',
        token: 'secret-custom-header',
        headerName: 'x-provider-token',
      },
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-custom',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = createTestOrchestrator([provider]);

  const spawn = await orchestrator.spawnRaid({
    taskTitle: 'Summarize the memo',
    taskDescription: 'Review the memo and summarize the main risks.',
    language: 'text',
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: 'text',
      artifactTypes: ['text'],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ['analysis'],
      minReputation: 0,
      allowedOutputTypes: ['text'],
      privacyMode: 'prefer',
    },
    rewardPolicy: {
      splitStrategy: 'equal_success_only',
    },
    privacyMode: {
      redactSecrets: true,
      redactIdentifiers: true,
      allowFullRepo: false,
    },
    hostContext: {
      host: 'codex',
    },
  });

  await waitFor(
    () =>
      orchestrator.getRaid(spawn.raidId)?.assignments['provider-custom-auth']?.providerRunId ===
      'run-custom'
  );

  const app = buildTestApiServer(orchestrator);

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/providers/provider-custom-auth/submit',
      headers: {
        'x-provider-token': 'Bearer secret-custom-header',
      },
      payload: {
        raidId: spawn.raidId,
        providerRunId: 'run-custom',
        answerText: 'Main risk is stale provider state.',
        explanation: 'The memo points to stale routing state as the main system risk.',
        confidence: 0.8,
        filesTouched: [],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'final');
  } finally {
    await app.close();
  }
});

test('provider submissions accept larger artifact callbacks than the public API body limit', async () => {
  const provider = {
    profile: createProviderProfile('provider-large-submit', {
      outputTypes: ['text', 'bundle'],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-large-submit',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const orchestrator = createTestOrchestrator([provider]);

  const spawn = await orchestrator.spawnRaid({
    taskTitle: 'Summarize the memo',
    taskDescription: 'Review the memo and summarize the main risks.',
    language: 'text',
    files: [],
    failingSignals: {
      errors: [],
    },
    output: {
      primaryType: 'text',
      artifactTypes: ['text', 'bundle'],
    },
    constraints: {
      numExperts: 1,
      maxBudgetUsd: 10,
      maxLatencySec: 10,
      allowExternalSearch: false,
      requireSpecializations: ['analysis'],
      minReputation: 0,
      allowedOutputTypes: ['text', 'bundle'],
      privacyMode: 'prefer',
    },
    rewardPolicy: {
      splitStrategy: 'equal_success_only',
    },
    privacyMode: {
      redactSecrets: true,
      redactIdentifiers: true,
      allowFullRepo: false,
    },
    hostContext: {
      host: 'codex',
    },
  });

  await waitFor(
    () =>
      orchestrator.getRaid(spawn.raidId)?.assignments['provider-large-submit']?.providerRunId ===
      'run-large-submit'
  );

  const app = buildTestApiServer(orchestrator, {
    BOSSRAID_API_BODY_LIMIT_BYTES: '512',
  });

  try {
    const largePayload = Buffer.from('x'.repeat(4_096), 'utf8').toString('base64');
    const response = await app.inject({
      method: 'POST',
      url: '/v1/providers/provider-large-submit/submit',
      payload: {
        raidId: spawn.raidId,
        providerRunId: 'run-large-submit',
        answerText: 'Main risk is stale provider state.',
        explanation: 'The memo points to stale routing state as the main system risk.',
        confidence: 0.8,
        filesTouched: [],
        artifacts: [
          {
            outputType: 'bundle',
            label: 'Large inline bundle',
            uri: `data:application/json;base64,${largePayload}`,
            mimeType: 'application/json',
          },
        ],
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, 'final');
  } finally {
    await app.close();
  }
});
