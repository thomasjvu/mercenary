import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderAcceptance } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import {
  buildTestApiServer,
  createTestApiServer,
  createProviderProfile,
  readyHealth,
} from './test/helpers.js';

test('GET /ready reports public beta readiness gates', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ready: true,
        model: 'gpt-5.5',
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      }
    );
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-ready-market', {
      modelProvider: 'openai',
      modelId: 'gpt-5.5',
      outputTypes: ['text'],
      supportedLanguages: ['text'],
    }),
    async accept(): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-ready-market',
      };
    },
    async run(): Promise<void> {},
  };
  const app = buildTestApiServer(
    new BossRaidOrchestrator([provider], undefined, undefined, undefined, async (profile) =>
      readyHealth(profile.providerId)
    ),
    {
      ...process.env,
      BOSSRAID_X402_ENABLED: 'false',
      BOSSRAID_STORAGE_BACKEND: 'memory',
    }
  );

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().ok, true);
    assert.equal(response.json().gates?.providers, true);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});

test('GET /ready reports buyer request budget limit', async () => {
  const app = createTestApiServer([], {
    ...process.env,
    BOSSRAID_BUYER_MAX_REQUEST_BUDGET_USD: '5',
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'false',
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().limits?.buyerMaxRequestBudgetUsd, 5);
  } finally {
    await app.close();
  }
});

test('GET /ready blocks settlement gate for production file settlement mode', async () => {
  const app = createTestApiServer([], {
    ...process.env,
    NODE_ENV: 'production',
    BOSSRAID_SETTLEMENT_MODE: 'file',
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'false',
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/ready',
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().gates?.settlement, false);
    assert.equal(response.json().gates?.storage, false);
    assert.equal(response.json().ok, false);
  } finally {
    await app.close();
  }
});

test('ops settings expose and toggle the runtime x402 gate', async () => {
  const app = createTestApiServer([], {
    ...process.env,
    BOSSRAID_ADMIN_TOKEN: 'admin-settings-token-with-production-length',
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'false',
    BOSSRAID_X402_PAY_TO: '0xabc',
    BOSSRAID_X402_FACILITATOR_URL: 'http://127.0.0.1:4021',
  });

  try {
    const unauthorized = await app.inject({
      method: 'GET',
      url: '/v1/ops/settings',
    });
    assert.equal(unauthorized.statusCode, 401);

    const initial = await app.inject({
      method: 'GET',
      url: '/v1/ops/settings',
      headers: {
        authorization: 'Bearer admin-settings-token-with-production-length',
      },
    });
    assert.equal(initial.statusCode, 200);
    assert.equal(initial.json().x402.enabled, false);
    assert.equal(initial.json().x402.canEnable, true);

    const enabled = await app.inject({
      method: 'PATCH',
      url: '/v1/ops/settings',
      headers: {
        authorization: 'Bearer admin-settings-token-with-production-length',
        'content-type': 'application/json',
      },
      payload: {
        x402Enabled: true,
      },
    });
    assert.equal(enabled.statusCode, 200);
    assert.equal(enabled.json().x402.enabled, true);

    const ready = await app.inject({
      method: 'GET',
      url: '/ready',
    });
    assert.equal(ready.statusCode, 200);
    assert.equal(typeof ready.json().ok, 'boolean');
  } finally {
    await app.close();
  }
});

test('ops metrics are admin-gated and expose route counters', async () => {
  const app = createTestApiServer([], {
    ...process.env,
    BOSSRAID_ADMIN_TOKEN: 'admin-metrics-token-with-production-length',
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });

  try {
    const unauthenticatedPrometheus = await app.inject({
      method: 'GET',
      url: '/metrics',
    });
    assert.equal(unauthenticatedPrometheus.statusCode, 401);

    await app.inject({
      method: 'GET',
      url: '/health',
    });

    const metrics = await app.inject({
      method: 'GET',
      url: '/v1/ops/metrics',
      headers: {
        authorization: 'Bearer admin-metrics-token-with-production-length',
      },
    });
    assert.equal(metrics.statusCode, 200);
    assert.equal(typeof metrics.json().counters['http.requests_total'], 'number');
    assert.equal(Boolean(metrics.json().routes['GET /health']), true);

    const prometheus = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: {
        authorization: 'Bearer admin-metrics-token-with-production-length',
      },
    });
    assert.equal(prometheus.statusCode, 200);
    assert.equal(prometheus.body.includes('bossraid_http_requests_total'), true);
  } finally {
    await app.close();
  }
});

test('production readiness report surfaces full-production blockers', async () => {
  const app = createTestApiServer([], {
    ...process.env,
    NODE_ENV: 'production',
    BOSSRAID_ADMIN_TOKEN: 'admin-readiness-token-with-production-length',
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'false',
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ops/production-readiness',
      headers: {
        authorization: 'Bearer admin-readiness-token-with-production-length',
      },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().ok, false);
    assert.equal(response.json().status, 'blocked');
    assert.equal(
      response
        .json()
        .checks.some(
          (check: { id: string; status: string }) =>
            check.id === 'onchain_settlement' && check.status === 'fail'
        ),
      true
    );
    assert.equal(
      response
        .json()
        .nextActions.some((action: { check: string }) => action.check === 'tee_attestation'),
      true
    );
  } finally {
    await app.close();
  }
});

test('production x402 enablement is blocked server-side by production readiness', async () => {
  const token = 'admin-production-toggle-token-with-length';
  const app = createTestApiServer([], {
    NODE_ENV: 'production',
    BOSSRAID_ADMIN_TOKEN: token,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_SETTLEMENT_MODE: 'file',
    BOSSRAID_X402_ENABLED: 'false',
    BOSSRAID_X402_PAY_TO: '0x0000000000000000000000000000000000000001',
    BOSSRAID_X402_FACILITATOR_URL: 'https://marian.example.com',
    BOSSRAID_X402_FACILITATOR_API_KEY: 'test-key',
  });
  try {
    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/ops/settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { x402Enabled: true },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, 'production_not_ready');
    const settings = await app.inject({
      method: 'GET',
      url: '/v1/ops/settings',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(settings.json().x402.enabled, false);
    const disabled = await app.inject({
      method: 'PATCH',
      url: '/v1/ops/settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { x402Enabled: false },
    });
    assert.equal(disabled.statusCode, 200);
  } finally {
    await app.close();
  }
});

test('settlement status reports invalid RPC configuration without throwing', async () => {
  const token = 'admin-invalid-rpc-token';
  const app = createTestApiServer([], {
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_ADMIN_TOKEN: token,
    BOSSRAID_SETTLEMENT_MODE: 'onchain',
    BOSSRAID_RPC_URL: 'invalid-url',
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/ops/settlement/status',
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().configured, false);
    assert.equal(response.json().rpcUrl, null);
  } finally {
    await app.close();
  }
});
