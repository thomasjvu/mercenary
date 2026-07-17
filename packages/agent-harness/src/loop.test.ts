import assert from 'node:assert/strict';
import test from 'node:test';
import { joinOpenAiApiPath, runAgentHarnessLoop } from './loop.js';
import type { ProviderTaskPackage } from '@bossraid/shared-types';
import type { HarnessRuntimeConfig } from './profile.js';

test('joinOpenAiApiPath keeps /v1 segment', () => {
  assert.equal(
    joinOpenAiApiPath('https://api.x.ai/v1', '/chat/completions'),
    'https://api.x.ai/v1/chat/completions'
  );
  assert.equal(
    joinOpenAiApiPath('https://api.x.ai/v1/', 'chat/completions'),
    'https://api.x.ai/v1/chat/completions'
  );
});

function makeTask(): ProviderTaskPackage {
  return {
    task: {
      title: 'test',
      description: 'answer ok',
      language: 'text',
      framework: 'openai_compatible',
    },
    desiredOutput: { primaryType: 'text' },
    artifacts: { files: [], errors: [], tests: [] },
    constraints: { maxBudgetUsd: 1 },
  } as unknown as ProviderTaskPackage;
}

const baseConfig: HarnessRuntimeConfig = {
  kind: 'claude_code',
  installation: 'fresh',
  skills: [],
  maxSteps: 3,
  allowShell: false,
};

const openaiToolsEnv = {
  BOSSRAID_HARNESS_RUNTIME_BACKEND: 'openai_tools',
  BOSSRAID_HARNESS_NATIVE_SDK: '0',
  NODE_ENV: 'test',
} as NodeJS.ProcessEnv;

test('runAgentHarnessLoop submits answer when model returns content without tools', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'hello from harness' } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )) as typeof fetch;

  try {
    const result = await runAgentHarnessLoop({
      task: makeTask(),
      config: baseConfig,
      apiBase: 'https://example.test/v1',
      apiKey: 'test',
      model: 'mock',
      timeoutMs: 5_000,
      env: openaiToolsEnv,
    });
    assert.equal(result.answerText, 'hello from harness');
    assert.ok(result.harnessTrace.steps >= 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('runAgentHarnessLoop rejects specialized seats without imageDigest', async () => {
  await assert.rejects(
    () =>
      runAgentHarnessLoop({
        task: makeTask(),
        config: {
          ...baseConfig,
          installation: 'skill_augmented',
          skills: [{ id: 'raid-pixel' }],
        },
        apiBase: 'https://example.test/v1',
        apiKey: 'test',
        model: 'mock',
        timeoutMs: 5_000,
        env: openaiToolsEnv,
      }),
    /imageDigest/i
  );
});

test('runAgentHarnessLoop native require fails closed when CLI missing', async () => {
  await assert.rejects(
    () =>
      runAgentHarnessLoop({
        task: makeTask(),
        config: { ...baseConfig, kind: 'claude_code' },
        apiBase: 'https://example.test/v1',
        apiKey: 'test',
        model: 'mock',
        timeoutMs: 3_000,
        env: {
          ...openaiToolsEnv,
          BOSSRAID_HARNESS_RUNTIME_BACKEND: 'claude_agent_sdk',
          BOSSRAID_HARNESS_NATIVE_SDK: 'require',
          BOSSRAID_CLAUDE_CLI_BIN: '/nonexistent/claude-binary-for-test',
        },
      }),
    /claude|Native harness|ENOENT|not found|failed/i
  );
});

test('runAgentHarnessLoop respects wall-clock deadline', async () => {
  const originalFetch = globalThis.fetch;
  let n = 0;
  // Keep returning tools so the loop cannot soft-complete; delay each call past budget.
  globalThis.fetch = (async () => {
    n += 1;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: `c${n}`,
                  type: 'function',
                  function: { name: 'list_files', arguments: '{}' },
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }) as typeof fetch;

  try {
    await assert.rejects(
      () =>
        runAgentHarnessLoop({
          task: makeTask(),
          config: { ...baseConfig, maxSteps: 8 },
          apiBase: 'https://example.test/v1',
          apiKey: 'test',
          model: 'mock',
          timeoutMs: 40,
          env: openaiToolsEnv,
        }),
      /wall-clock budget/i
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
