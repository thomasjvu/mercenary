import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestApiServer } from './test/helpers.js';

test('Boss Raid has no standalone inference or upstream seller API', async () => {
  const app = createTestApiServer([]);
  try {
    for (const [method, url] of [
      ['POST', '/v1/inference/chat/completions'],
      ['GET', '/v1/inference/status'],
      ['GET', '/v1/models'],
      ['GET', '/v1/prices'],
      ['GET', '/v1/markets'],
      ['POST', '/v1/seller/upstream/openai/connect'],
      ['POST', '/v1/seller/upstream/openai/offers'],
      ['POST', '/v1/ops/platform-liquidity/bootstrap'],
      ['POST', '/gateway/provider/v1/raid/accept'],
    ] as const) {
      const response = await app.inject({ method, url });
      assert.equal(response.statusCode, 404, `${method} ${url}`);
    }
    assert.equal((await app.inject({ method: 'GET', url: '/v1/providers' })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/v1/bounties' })).statusCode, 200);
  } finally {
    await app.close();
  }
});
