import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestApiServer } from './test/helpers.js';

test('marketplace tee attestation returns verification checklist in mock mode', async () => {
  const app = createTestApiServer([], {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_UPSTREAM_TEE_MOCK: '1',
    BOSSRAID_VENICE_API_KEY: 'vn_test_key',
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/marketplace/tee/attestation',
      payload: {
        provider: 'venice',
        modelId: 'e2ee-gemma-4-26b-a4b-uncensored-p',
      },
    });

    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.valid, true);
    assert.ok(Array.isArray(body.checks));
    assert.equal(body.e2eeReady, true);
    assert.ok(body.explorerUrl);
  } finally {
    await app.close();
  }
});
