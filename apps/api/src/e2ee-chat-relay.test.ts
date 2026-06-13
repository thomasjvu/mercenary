import assert from 'node:assert/strict';
import test from 'node:test';
import { buildApiServer, readyHealth } from './test/helpers.js';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';

test('POST /v1/inference/chat/completions runs server E2EE relay for strict catalog models', async () => {
  const orchestrator = new BossRaidOrchestrator(
    [],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildApiServer(orchestrator, {
    ...process.env,
    BOSSRAID_UPSTREAM_TEE_MOCK: '1',
    BOSSRAID_VENICE_MOCK: '1',
    BOSSRAID_VENICE_API_KEY: 'vn_test_key',
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        model: 'e2ee-gemma-4-26b-a4b-uncensored-p',
        messages: [{ role: 'user', content: 'Say ok.' }],
        raid_policy: {
          privacy_mode: 'strict',
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as { choices?: Array<{ message?: { content?: string } }> };
    assert.equal(typeof body.choices?.[0]?.message?.content, 'string');
    assert.ok((body.choices?.[0]?.message?.content?.length ?? 0) > 0);
  } finally {
    await app.close();
  }
});

test('POST /v1/inference/chat/completions streams strict E2EE with receipt metadata', async () => {
  const orchestrator = new BossRaidOrchestrator(
    [],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildApiServer(orchestrator, {
    ...process.env,
    BOSSRAID_UPSTREAM_TEE_MOCK: '1',
    BOSSRAID_VENICE_MOCK: '1',
    BOSSRAID_VENICE_API_KEY: 'vn_test_key',
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: {
        'content-type': 'application/json',
      },
      payload: {
        model: 'e2ee-gemma-4-26b-a4b-uncensored-p',
        stream: true,
        messages: [{ role: 'user', content: 'Say ok.' }],
        raid_policy: {
          privacy_mode: 'strict',
        },
      },
    });

    assert.equal(response.statusCode, 200);
    assert.match(response.body, /"receiptId"/);
    assert.match(response.body, /"finish_reason":"stop"/);
    assert.match(response.body, /\[DONE\]/);
  } finally {
    await app.close();
  }
});

test('POST /v1/inference/chat/completions requires upstream key for strict E2EE', async () => {
  const orchestrator = new BossRaidOrchestrator(
    [],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildApiServer(orchestrator, {
    ...process.env,
    BOSSRAID_UPSTREAM_TEE_MOCK: '1',
    BOSSRAID_VENICE_API_KEY: undefined,
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      payload: {
        model: 'e2ee-gemma-4-26b-a4b-uncensored-p',
        messages: [{ role: 'user', content: 'Say ok.' }],
        raid_policy: {
          privacy_mode: 'strict',
        },
      },
    });

    assert.equal(response.statusCode, 400);
    assert.match(response.json().message ?? '', /Upstream API key required/i);
  } finally {
    await app.close();
  }
});
