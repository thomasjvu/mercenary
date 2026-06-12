import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { buildApiServer, resolveChatTerminalSettleGraceMs } from './index.js';
import {
  createTestOrchestrator,
  createProviderProfile,
  FAST_TEST_TIMING,
  readyHealth,
} from './test/helpers.js';

test('POST /v1/chat/completions synthesizes a text raid and returns a multi-provider answer', async () => {
  const receivedTasks: ProviderTaskPackage[] = [];

  const providerA: RaidProvider = {
    profile: createProviderProfile('provider-chat-a', {
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-chat-a',
      };
    },
    async run(task, callbacks): Promise<void> {
      receivedTasks.push(task);
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-chat-a',
        providerRunId: 'run-chat-a',
        answerText: 'The add function subtracts instead of adding.',
        explanation: 'The helper returns a - b instead of a + b, so every result is inverted.',
        confidence: 0.92,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };

  const providerB: RaidProvider = {
    profile: createProviderProfile('provider-chat-b', {
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-chat-b',
      };
    },
    async run(task, callbacks): Promise<void> {
      receivedTasks.push(task);
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-chat-b',
        providerRunId: 'run-chat-b',
        answerText: 'The helper returns a - b, so sums are backwards.',
        explanation:
          'The bug is in the return expression, and the fix is to switch subtraction back to addition.',
        confidence: 0.88,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };

  const orchestrator = createTestOrchestrator([providerA, providerB]);
  const app = buildApiServer(orchestrator);

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'system',
            content: 'Return one short sentence.',
          },
          {
            role: 'user',
            content: 'Inspect the math helper and explain the bug.',
          },
        ],
        raid_policy: {
          max_total_cost: 7,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(receivedTasks[0]?.task.title, 'Inspect the math helper and explain the bug.');
    assert.match(receivedTasks[0]?.task.description ?? '', /Return one short sentence\./);
    assert.match(
      receivedTasks[0]?.task.description ?? '',
      /Inspect the math helper and explain the bug\./
    );
    assert.match(receivedTasks[0]?.task.description ?? '', /Assigned workstream:/);
    assert.match(receivedTasks[0]?.task.description ?? '', /Assigned sub-role:/);
    assert.equal(receivedTasks[0]?.task.language, 'text');
    assert.equal(receivedTasks[0]?.desiredOutput.primaryType, 'text');
    assert.equal(receivedTasks[0]?.synthesis?.totalExperts, 2);
    assert.match(receivedTasks[0]?.synthesis?.focus ?? '', /math helper/i);
    assert.match(receivedTasks[0]?.synthesis?.workstreamObjective ?? '', /math helper/i);
    assert.notEqual(receivedTasks[0]?.synthesis?.roleLabel, receivedTasks[1]?.synthesis?.roleLabel);
    assert.notEqual(
      receivedTasks[0]?.synthesis?.workstreamLabel,
      receivedTasks[1]?.synthesis?.workstreamLabel
    );
    const body = response.json();
    assert.notEqual(receivedTasks[0]?.raidId, body.raid.raid_id);
    assert.notEqual(receivedTasks[1]?.raidId, body.raid.raid_id);
    assert.equal(orchestrator.getRaid(receivedTasks[0]!.raidId)?.parentRaidId, body.raid.raid_id);
    assert.equal(orchestrator.getRaid(receivedTasks[1]!.raidId)?.parentRaidId, body.raid.raid_id);
    assert.match(body.id, /^chatcmpl_/);
    assert.equal(body.object, 'chat.completion');
    assert.equal(typeof body.created, 'number');
    assert.equal(body.model, 'mercenary-v1');
    assert.equal(body.system_fingerprint, 'mercenary-v1');
    assert.equal(body.choices[0]?.index, 0);
    assert.equal(body.choices[0]?.message.role, 'assistant');
    assert.match(body.choices[0]?.message.content, /subtracts instead of adding|returns a - b/);
    assert.doesNotMatch(body.choices[0]?.message.content, /Risk:/);
    assert.doesNotMatch(body.choices[0]?.message.content, /Supporting workstreams:/);
    assert.equal(body.choices[0]?.finish_reason, 'stop');
    assert.match(body.raid.raid_id, /^raid_/);
    assert.equal(typeof body.raid.raid_access_token, 'string');
    assert.ok(body.raid.raid_access_token.length > 0);
    assert.equal(
      body.raid.receipt_path,
      `/receipt?raidId=${body.raid.raid_id}&token=${body.raid.raid_access_token}`
    );
    assert.equal(body.raid.agents_invited, 2);
    assert.equal(body.raid.agents_succeeded, 2);
    assert.deepEqual([...body.raid.successful_agents].sort(), [
      'provider-chat-a',
      'provider-chat-b',
    ]);
    assert.deepEqual([...body.raid.synthesized_from_agents].sort(), [
      'provider-chat-a',
      'provider-chat-b',
    ]);
    assert.equal(body.raid.status, 'final');
    assert.ok(body.usage.prompt_tokens > 0);
    assert.ok(body.usage.completion_tokens > 0);
    assert.equal(body.usage.total_tokens, body.usage.prompt_tokens + body.usage.completion_tokens);
  } finally {
    await app.close();
  }
});

test('POST /v1/chat/completions can recurse into nested child raids for larger expert counts', async () => {
  const receivedTasks: ProviderTaskPackage[] = [];
  const providers = Array.from({ length: 5 }, (_, index): RaidProvider => {
    const providerId = `provider-chat-depth-${index + 1}`;
    return {
      profile: createProviderProfile(providerId, {
        outputTypes: ['text', 'json'],
        supportedLanguages: ['text'],
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
          answerText: `Depth contribution ${index + 1} isolates one part of the bug.`,
          explanation: `Depth contribution ${index + 1} gives Mercenary another expert signal for the merged answer.`,
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
  const app = buildApiServer(orchestrator);

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'gpt-4.1-mini',
        messages: [
          {
            role: 'user',
            content: 'Explain the bug directly from multiple expert angles.',
          },
        ],
        raid_policy: {
          max_agents: 5,
          max_total_cost: 17.5,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(receivedTasks.length, 5);
    const body = response.json();
    const nestedTaskRaid = receivedTasks
      .map((task) => orchestrator.getRaid(task.raidId))
      .find(
        (raid) =>
          raid?.parentRaidId &&
          orchestrator.getRaid(raid.parentRaidId)?.parentRaidId === body.raid.raid_id
      );

    assert.ok(nestedTaskRaid);
    assert.equal(body.raid.agents_invited, 5);
    assert.equal(body.raid.agents_succeeded, 5);
    assert.equal(body.raid.successful_agents.length, 5);
    assert.equal(body.raid.synthesized_from_agents.length, 5);
    assert.equal(body.model, 'mercenary-v1');
  } finally {
    await app.close();
  }
});

test('POST /v1/chat/completions supports streaming on the v1 route', async () => {
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-chat-stream', {
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-chat-stream',
      };
    },
    async run(task, callbacks): Promise<void> {
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-chat-stream',
        providerRunId: 'run-chat-stream',
        answerText: 'The add helper subtracts instead of adding.',
        explanation: 'Switch the arithmetic operator back to addition.',
        confidence: 0.94,
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
  const app = buildApiServer(orchestrator);

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      payload: {
        model: 'mercenary-v1',
        stream: true,
        messages: [
          {
            role: 'user',
            content: 'Explain the bug.',
          },
        ],
        raid_policy: {
          max_total_cost: 6,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.headers['content-type'] ?? '', /text\/event-stream/);
    assert.match(response.payload, /chat\.completion\.chunk/);
    assert.match(response.payload, /mercenary-v1/);
    assert.match(response.payload, /The add helper subtracts instead of adding\./);
    assert.match(response.payload, /\[DONE\]/);
  } finally {
    await app.close();
  }
});

test('POST /v1/chat/completions waits for a terminal raid state instead of replying with first_valid', async () => {
  const fastProvider: RaidProvider = {
    profile: createProviderProfile('provider-chat-fast', {
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-chat-fast',
      };
    },
    async run(task, callbacks): Promise<void> {
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-chat-fast',
        providerRunId: 'run-chat-fast',
        answerText: 'The helper subtracts instead of adding.',
        explanation: 'Swap subtraction back to addition.',
        confidence: 0.94,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };

  const slowProvider: RaidProvider = {
    profile: createProviderProfile('provider-chat-slow', {
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-chat-slow',
      };
    },
    async run(task, callbacks): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve, 2_500));
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-chat-slow',
        providerRunId: 'run-chat-slow',
        answerText: 'Second opinion confirms the same arithmetic bug.',
        explanation: 'The return expression is inverted.',
        confidence: 0.8,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [fastProvider, slowProvider],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 2_000,
      hardExecutionMs: 5_000,
      raidAbsoluteMs: 5_000,
    },
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
            content: 'Explain the bug.',
          },
        ],
        raid_policy: {
          max_agents: 2,
          max_total_cost: 8,
          max_latency_sec: 1,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.raid.status, 'final');
    assert.equal(body.raid.agents_invited, 2);
    assert.equal(body.raid.agents_succeeded, 1);
    assert.deepEqual(body.raid.successful_agents, ['provider-chat-fast']);
    assert.doesNotMatch(body.choices[0]?.message.content, /Raid .* started/);
  } finally {
    await app.close();
  }
});

test('POST /v1/chat/completions answers low-signal chat directly without opening a raid', async () => {
  let acceptCount = 0;
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-chat-fallback', {
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      acceptCount += 1;
      return {
        accepted: true,
        providerRunId: 'run-chat-fallback',
      };
    },
    async run(task, callbacks): Promise<void> {
      await callbacks.onFailure(new Error('No approved output for greeting-only input.'));
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 2_000,
      hardExecutionMs: 5_000,
      raidAbsoluteMs: 5_000,
    },
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildApiServer(orchestrator, {
    ...process.env,
    BOSSRAID_CHAT_DEFAULT_MAX_TOTAL_COST: '8',
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
            content: 'yo',
          },
        ],
        raid_policy: {
          max_agents: 1,
          max_total_cost: 8,
          max_latency_sec: 5,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.raid, undefined);
    assert.equal(acceptCount, 0);
    assert.equal(
      body.choices[0]?.message.content,
      'Mercenary here. Ask a question or give me a concrete task and I’ll answer directly or open specialists when it helps.'
    );
    assert.doesNotMatch(body.choices[0]?.message.content, /Raid .* started/);
  } finally {
    await app.close();
  }
});

test('POST /v1/chat/completions keeps follow-up joke prompts direct without opening a raid', async () => {
  let acceptCount = 0;
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-chat-joke', {
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      acceptCount += 1;
      return {
        accepted: true,
        providerRunId: 'run-chat-joke',
      };
    },
    async run(_task, callbacks): Promise<void> {
      await callbacks.onFailure(
        new Error('Direct chat should not have opened specialists for a joke.')
      );
    },
  };

  const orchestrator = new BossRaidOrchestrator(
    [provider],
    {
      inviteAcceptMs: 1_000,
      firstHeartbeatMs: 2_000,
      hardExecutionMs: 5_000,
      raidAbsoluteMs: 5_000,
    },
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildApiServer(orchestrator, {
    ...process.env,
    BOSSRAID_CHAT_DEFAULT_MAX_TOTAL_COST: '8',
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
            content: 'tell me a better joke',
          },
        ],
        raid_policy: {
          max_agents: 1,
          max_total_cost: 8,
          max_latency_sec: 5,
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.raid, undefined);
    assert.equal(acceptCount, 0);
    assert.equal(
      body.choices[0]?.message.content,
      'Why did the programmer go broke? Because he used up all his cache.'
    );
  } finally {
    await app.close();
  }
});
