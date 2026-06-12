import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import { buildApiServer } from './index.js';
import {
  createTestApiServer,
  createProviderProfile,
  createRaidRequestBody,
  createX402PaidTestEnv,
  readyHealth,
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

test('demo raid route can stay free while native raid stays paid', async () => {
  const providers = ['provider-demo-free-a', 'provider-demo-free-b'].map((providerId) => ({
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
    BOSSRAID_DEMO_ROUTE_ENABLED: 'true',
    BOSSRAID_DEMO_TOKEN: 'demo-secret',
    ...createX402PaidTestEnv(),
  };

  const demoApp = buildApiServer(
    new BossRaidOrchestrator(providers, {}, undefined, undefined, async (profile) =>
      readyHealth(profile.providerId)
    ),
    env
  );
  const paidApp = buildApiServer(
    new BossRaidOrchestrator(providers, {}, undefined, undefined, async (profile) =>
      readyHealth(profile.providerId)
    ),
    env
  );

  try {
    const demoResponse = await demoApp.inject({
      method: 'POST',
      url: '/v1/demo/raid',
      headers: {
        'x-bossraid-demo-token': 'demo-secret',
      },
      payload: createRaidRequestBody(),
    });

    assert.equal(demoResponse.statusCode, 200);
    assert.equal(demoResponse.headers['payment-required'], undefined);

    const paidResponse = await paidApp.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: createRaidRequestBody(),
    });

    assert.equal(paidResponse.statusCode, 402);
  } finally {
    await demoApp.close();
    await paidApp.close();
  }
});

test('demo raid route returns 404 when disabled', async () => {
  const provider = {
    profile: createProviderProfile('provider-demo-disabled'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-demo-disabled',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const app = buildApiServer(
    new BossRaidOrchestrator([provider], {}, undefined, undefined, async (profile) =>
      readyHealth(profile.providerId)
    ),
    createX402PaidTestEnv()
  );

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/demo/raid',
      payload: createRaidRequestBody(),
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), {
      error: 'not_found',
      message: 'Demo raid route is not enabled.',
    });
  } finally {
    await app.close();
  }
});

test('demo route startup fails closed when enabled without a demo token', () => {
  assert.throws(
    () =>
      createTestApiServer([], {
        ...process.env,
        BOSSRAID_STORAGE_BACKEND: 'memory',
        BOSSRAID_DEMO_ROUTE_ENABLED: 'true',
      }),
    /BOSSRAID_DEMO_TOKEN is required/
  );
});

test('demo raid route can require a dedicated demo token', async () => {
  const provider = {
    profile: createProviderProfile('provider-demo-token'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-demo-token',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const app = buildApiServer(
    new BossRaidOrchestrator([provider], {}, undefined, undefined, async (profile) =>
      readyHealth(profile.providerId)
    ),
    createX402PaidTestEnv({
      BOSSRAID_DEMO_ROUTE_ENABLED: 'true',
      BOSSRAID_DEMO_TOKEN: 'demo-secret',
    })
  );

  try {
    const unauthorized = await app.inject({
      method: 'POST',
      url: '/v1/demo/raid',
      payload: createRaidRequestBody(),
    });

    assert.equal(unauthorized.statusCode, 401);
    assert.deepEqual(unauthorized.json(), {
      error: 'unauthorized',
      message: 'Demo raid route requires a valid x-bossraid-demo-token header.',
    });

    const authorized = await app.inject({
      method: 'POST',
      url: '/v1/demo/raid',
      headers: {
        'x-bossraid-demo-token': 'demo-secret',
      },
      payload: createRaidRequestBody(),
    });

    assert.equal(authorized.statusCode, 200);
    assert.equal(authorized.headers['payment-required'], undefined);
  } finally {
    await app.close();
  }
});
