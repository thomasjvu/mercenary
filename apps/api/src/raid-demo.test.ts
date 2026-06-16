import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import {
  createTestApiServer,
  createProviderProfile,
  createRaidRequestBody,
  createX402PaidTestEnv,
  FAST_TEST_TIMING,
} from './test/helpers.js';

test('public raid spawn is rate limited before orchestration work runs', async () => {
  const app = createTestApiServer([], {
    BOSSRAID_PUBLIC_RATE_LIMIT_MAX: '1',
    BOSSRAID_PUBLIC_RATE_LIMIT_WINDOW_MS: '60000',
  });

  try {
    const firstAttempt = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: createRaidRequestBody(),
    });
    assert.equal(firstAttempt.statusCode, 409);

    const secondAttempt = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: createRaidRequestBody(),
    });
    assert.equal(secondAttempt.statusCode, 429);
    assert.equal(secondAttempt.json().error, 'rate_limited');
    assert.equal(secondAttempt.headers['retry-after'], '60');
  } finally {
    await app.close();
  }
});

test('public rate limiting ignores spoofed forwarded headers unless trustProxy is enabled', async () => {
  const app = createTestApiServer([], {
    BOSSRAID_PUBLIC_RATE_LIMIT_MAX: '1',
    BOSSRAID_PUBLIC_RATE_LIMIT_WINDOW_MS: '60000',
  });

  try {
    const firstAttempt = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      headers: {
        'x-forwarded-for': '198.51.100.10',
      },
      payload: createRaidRequestBody(),
    });
    assert.equal(firstAttempt.statusCode, 409);

    const secondAttempt = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      headers: {
        'x-forwarded-for': '203.0.113.25',
      },
      payload: createRaidRequestBody(),
    });
    assert.equal(secondAttempt.statusCode, 429);
    assert.equal(secondAttempt.json().error, 'rate_limited');
  } finally {
    await app.close();
  }
});

test('admin session can spawn on POST /v1/raid while x402 stays required for public callers', async () => {
  const providers = ['provider-admin-spawn-a', 'provider-admin-spawn-b'].map((providerId) => ({
    profile: createProviderProfile(providerId),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: `run-${providerId}`,
      };
    },
    async run(): Promise<void> {
      return;
    },
  }));
  const env = {
    BOSSRAID_ADMIN_TOKEN: 'admin-secret',
    ...createX402PaidTestEnv(),
  };
  const adminApp = createTestApiServer(providers, env, FAST_TEST_TIMING);
  const publicApp = createTestApiServer(providers, env, FAST_TEST_TIMING);

  try {
    const adminResponse = await adminApp.inject({
      method: 'POST',
      url: '/v1/raid',
      headers: {
        authorization: 'Bearer admin-secret',
      },
      payload: createRaidRequestBody(),
    });

    assert.equal(adminResponse.statusCode, 200);
    assert.equal(adminResponse.headers['payment-required'], undefined);
    assert.ok(adminResponse.json().raidId);

    const publicResponse = await publicApp.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: createRaidRequestBody(),
    });

    assert.equal(publicResponse.statusCode, 402);
  } finally {
    await Promise.all([adminApp.close(), publicApp.close()]);
  }
});
