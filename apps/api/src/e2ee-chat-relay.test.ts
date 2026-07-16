import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildApiServer,
  buildTestApiServer,
  createPublicSessionCookie,
  readyHealth,
} from './test/helpers.js';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';

const E2EE_MODEL = 'e2ee-gemma-4-26b-a4b-uncensored-p';
const E2EE_PAYLOAD = {
  model: E2EE_MODEL,
  messages: [{ role: 'user', content: 'Say ok.' }],
  raid_policy: {
    privacy_mode: 'strict',
  },
};

function e2eeMockEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BOSSRAID_UPSTREAM_TEE_MOCK: '1',
    BOSSRAID_VENICE_MOCK: '1',
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'false',
    BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND: 'true',
    BOSSRAID_VENICE_API_KEY: 'vn_test_key',
    ...overrides,
  };
}

async function fundBuyerApiKey(
  app: ReturnType<typeof buildTestApiServer>,
  options?: { walletIndex?: number; amountUsd?: number; spendLimitUsd?: number }
) {
  const session = await createPublicSessionCookie(app, options?.walletIndex ?? 0);
  const funded = await app.inject({
    method: 'POST',
    url: '/v1/buyer/balance/fund',
    headers: { cookie: session.cookie },
    payload: { amountUsd: options?.amountUsd ?? 5 },
  });
  assert.equal(funded.statusCode, 200, funded.body);

  const created = await app.inject({
    method: 'POST',
    url: '/v1/buyer/api-keys',
    headers: { cookie: session.cookie },
    payload: {
      name: 'E2EE prepaid key',
      spendLimitUsd: options?.spendLimitUsd ?? 10,
    },
  });
  assert.equal(created.statusCode, 201, created.body);
  return {
    session,
    apiKey: created.json().apiKey as string,
  };
}

test('POST /v1/inference/chat/completions rejects unauthenticated strict E2EE (no free platform key)', async () => {
  const orchestrator = new BossRaidOrchestrator(
    [],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  // buildApiServer (no wrapMercenaryTestInject) so no auto session cookie.
  const app = buildApiServer(orchestrator, e2eeMockEnv());

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: {
        'content-type': 'application/json',
      },
      payload: E2EE_PAYLOAD,
    });

    assert.equal(response.statusCode, 401, response.body);
    assert.equal(response.json().error, 'unauthorized');
  } finally {
    await app.close();
  }
});

test('POST /v1/inference/chat/completions rejects session-only platform-key E2EE without prepaid API key', async () => {
  const orchestrator = new BossRaidOrchestrator(
    [],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildTestApiServer(orchestrator, e2eeMockEnv());

  try {
    // Auto-session via wrapMercenaryTestInject; no buyer API key.
    const response = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: {
        'content-type': 'application/json',
      },
      payload: E2EE_PAYLOAD,
    });

    assert.equal(response.statusCode, 402);
    assert.equal(response.json().error, 'payment_required');
  } finally {
    await app.close();
  }
});

test('POST /v1/inference/chat/completions runs strict E2EE with prepaid buyer API key + platform Venice key', async () => {
  const orchestrator = new BossRaidOrchestrator(
    [],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildTestApiServer(orchestrator, e2eeMockEnv());

  try {
    const { apiKey } = await fundBuyerApiKey(app, { walletIndex: 1 });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      payload: E2EE_PAYLOAD,
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as { choices?: Array<{ message?: { content?: string } }> };
    assert.equal(typeof body.choices?.[0]?.message?.content, 'string');
    assert.ok((body.choices?.[0]?.message?.content?.length ?? 0) > 0);
  } finally {
    await app.close();
  }
});

test('POST /v1/inference/chat/completions allows BYO upstream key with session (no prepaid balance)', async () => {
  const orchestrator = new BossRaidOrchestrator(
    [],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildTestApiServer(
    orchestrator,
    e2eeMockEnv({
      // Platform key absent — must use buyer-supplied header key.
      BOSSRAID_VENICE_API_KEY: undefined,
    })
  );

  try {
    const session = await createPublicSessionCookie(app, 2);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: {
        'content-type': 'application/json',
        cookie: session.cookie,
        'x-bossraid-upstream-api-key': 'vn_buyer_byo_key',
      },
      payload: E2EE_PAYLOAD,
    });

    assert.equal(response.statusCode, 200, response.body);
    const body = response.json() as { choices?: Array<{ message?: { content?: string } }> };
    assert.equal(typeof body.choices?.[0]?.message?.content, 'string');
  } finally {
    await app.close();
  }
});

test('POST /v1/inference/chat/completions streams strict E2EE with receipt metadata on paid path', async () => {
  const orchestrator = new BossRaidOrchestrator(
    [],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildTestApiServer(orchestrator, e2eeMockEnv());

  try {
    const { apiKey } = await fundBuyerApiKey(app, { walletIndex: 3 });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      payload: {
        ...E2EE_PAYLOAD,
        stream: true,
      },
    });

    assert.equal(response.statusCode, 200, response.body);
    assert.match(response.body, /"receiptId"/);
    assert.match(response.body, /"finish_reason":"stop"/);
    assert.match(response.body, /\[DONE\]/);
  } finally {
    await app.close();
  }
});

test('POST /v1/inference/chat/completions requires upstream key when platform key is not authorized', async () => {
  const orchestrator = new BossRaidOrchestrator(
    [],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildTestApiServer(
    orchestrator,
    e2eeMockEnv({
      BOSSRAID_VENICE_API_KEY: undefined,
    })
  );

  try {
    const { apiKey } = await fundBuyerApiKey(app, { walletIndex: 4 });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: {
        authorization: `Bearer ${apiKey}`,
      },
      payload: E2EE_PAYLOAD,
    });

    // Paid path allows platform key, but env key is missing and no BYO header.
    assert.equal(response.statusCode, 400);
    assert.match(response.json().message ?? '', /Upstream API key required/i);
  } finally {
    await app.close();
  }
});

test('POST /v1/inference/chat/completions allows admin platform-key E2EE without prepaid balance', async () => {
  const orchestrator = new BossRaidOrchestrator(
    [],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const adminToken = 'e2ee-admin-test-token-with-sufficient-length';
  const app = buildTestApiServer(
    orchestrator,
    e2eeMockEnv({
      BOSSRAID_ADMIN_TOKEN: adminToken,
    })
  );

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adminToken}`,
      },
      payload: E2EE_PAYLOAD,
    });

    assert.equal(response.statusCode, 200, response.body);
  } finally {
    await app.close();
  }
});
