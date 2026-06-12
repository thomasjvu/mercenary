import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestApiServer, createPublicSessionCookie } from './test/helpers.js';

test('seller venice connect stores encrypted config and lists merged models', async () => {
  const app = createTestApiServer([], {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_VENICE_MOCK: '1',
  });

  try {
    const session = await createPublicSessionCookie(app);
    const connected = await app.inject({
      method: 'POST',
      url: '/v1/seller/upstream/venice/connect',
      headers: { cookie: session.cookie },
      payload: { apiKey: 'vn_test_key_12345678' },
    });
    assert.equal(connected.statusCode, 200);
    assert.equal(connected.json().config.configured, true);
    assert.match(connected.json().config.keyPrefix, /^vn_/);

    const models = await app.inject({
      method: 'GET',
      url: '/v1/seller/upstream/venice/models',
      headers: { cookie: session.cookie },
    });
    assert.equal(models.statusCode, 200);
    assert.ok(models.json().data.length >= 80);
    assert.ok(
      models
        .json()
        .data.some((entry: { modelId: string }) => entry.modelId === 'venice-uncensored-1-2')
    );
  } finally {
    await app.close();
  }
});

test('seller redpill connect stores config when mock enabled', async () => {
  const app = createTestApiServer([], {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_UPSTREAM_MOCK: '1',
  });

  try {
    const session = await createPublicSessionCookie(app);
    const connected = await app.inject({
      method: 'POST',
      url: '/v1/seller/upstream/redpill/connect',
      headers: { cookie: session.cookie },
      payload: { apiKey: 'rp_test_key_12345678' },
    });
    assert.equal(connected.statusCode, 200);
    assert.equal(connected.json().config.provider, 'redpill');
  } finally {
    await app.close();
  }
});

test('seller venice offers publishes hosted gateway providers', async () => {
  const app = createTestApiServer([], {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_VENICE_MOCK: '1',
  });

  try {
    const session = await createPublicSessionCookie(app);
    await app.inject({
      method: 'POST',
      url: '/v1/seller/upstream/venice/connect',
      headers: { cookie: session.cookie },
      payload: { apiKey: 'vn_test_key_12345678' },
    });

    const published = await app.inject({
      method: 'POST',
      url: '/v1/seller/upstream/venice/offers',
      headers: { cookie: session.cookie },
      payload: {
        modelIds: ['venice-uncensored-1-2', 'claude-opus-4-7'],
        discountPercent: 40,
      },
    });
    assert.equal(published.statusCode, 201);
    assert.equal(published.json().providers.length, 2);
    assert.equal(published.json().providers[0].verificationStatus, 'verified');

    const market = await app.inject({
      method: 'GET',
      url: '/v1/markets?model_id=venice-uncensored-1-2',
    });
    assert.equal(market.statusCode, 200);
    assert.ok(market.json().data[0].activeProviderCount >= 1);
  } finally {
    await app.close();
  }
});
