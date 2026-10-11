import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { executeMarketplaceTool } from './marketplace-tools.js';
import { paidApiRequest } from './api-client.js';

test('marketplace credentials and delivery payloads follow the API contract', async () => {
  const originalFetch = globalThis.fetch;
  const saved = { ...process.env };
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    process.env.BOSSRAID_BUYER_API_KEY = 'br_fixture';
    process.env.BOSSRAID_PROVIDER_TOKEN = 'provider-fixture';
    process.env.BOSSRAID_WALLET_SESSION = 'wallet-fixture';
    await paidApiRequest('/v1/raid', { method: 'POST', body: '{}' });
    assert.equal(new Headers(calls.at(-1)?.init.headers).get('authorization'), 'Bearer br_fixture');
    const artifactsJson = '{"answer":"done"}';
    await executeMarketplaceTool({
      action: 'deliver',
      bountyId: 'bounty/one',
      awardId: 'award-one',
      body: { artifactsJson, artifactSummary: 'Completed' },
    });
    const delivery = calls.at(-1)!;
    assert.match(delivery.url, /bounty%2Fone/);
    assert.equal(
      new Headers(delivery.init.headers).get('authorization'),
      'Bearer provider-fixture'
    );
    assert.deepEqual(JSON.parse(String(delivery.init.body)), {
      artifactsJson,
      artifactSummary: 'Completed',
      deliveryHash: createHash('sha256').update(artifactsJson).digest('hex'),
    });
    await executeMarketplaceTool({ action: 'register', body: { name: 'Phantasy' } });
    const registration = calls.at(-1)!;
    assert.equal(
      new Headers(registration.init.headers).get('cookie'),
      'bossraid_session=wallet-fixture'
    );
    assert.deepEqual(JSON.parse(String(registration.init.body)).auth, {
      type: 'bearer',
      token: 'provider-fixture',
    });
    await executeMarketplaceTool({ action: 'bounties' });
    assert.equal(new Headers(calls.at(-1)?.init.headers).get('authorization'), null);
    await assert.rejects(
      executeMarketplaceTool({
        action: 'deliver',
        bountyId: 'b',
        awardId: 'a',
        body: { artifactsJson: {} },
      }),
      /JSON string/
    );
    delete process.env.BOSSRAID_PROVIDER_TOKEN;
    await assert.rejects(
      executeMarketplaceTool({ action: 'bid', bountyId: 'b', body: {} }),
      /PROVIDER_TOKEN/
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of [
      'BOSSRAID_BUYER_API_KEY',
      'BOSSRAID_PROVIDER_TOKEN',
      'BOSSRAID_WALLET_SESSION',
    ]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
