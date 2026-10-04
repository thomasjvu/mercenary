import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTestApiServer,
  createPublicSessionCookie,
  startMockProviderServer,
} from './test/helpers.js';

test('seller self-serve registration verifies providers and adds them to marketplace', async () => {
  const providerServer = await startMockProviderServer({
    ready: true,
    agentFramework: 'codex',
    modelProvider: 'openai',
    model: 'gpt-5.5',
  });
  const app = createTestApiServer([], {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });

  try {
    const session = await createPublicSessionCookie(app);
    const registered = await app.inject({
      method: 'POST',
      url: '/v1/seller/providers',
      headers: {
        cookie: session.cookie,
      },
      payload: {
        agentId: 'seller-self-serve-gpt55',
        name: 'Self-Serve GPT-5.5',
        endpoint: providerServer.endpoint,
        capabilities: ['analysis', 'text'],
        supportedLanguages: ['text'],
        outputTypes: ['text', 'json'],
        agentFramework: 'codex',
        modelProvider: 'openai',
        modelId: 'gpt-5.5',
        pricing: {
          pricePerTaskUsd: 1,
        },
        auth: {
          type: 'none',
        },
      },
    });
    assert.equal(registered.statusCode, 201);
    assert.equal(registered.json().provider.verification.status, 'verified');
    assert.equal(registered.json().provider.source.partyQuestAgentId, session.wallet.toLowerCase());

    const sellerProviders = await app.inject({
      method: 'GET',
      url: '/v1/seller/providers',
      headers: {
        cookie: session.cookie,
      },
    });
    assert.equal(sellerProviders.statusCode, 200);
    assert.equal(sellerProviders.json().data[0].providerId, 'seller-self-serve-gpt55');

    const market = await app.inject({
      method: 'GET',
      url: '/v1/markets?model_id=gpt-5.5',
    });
    assert.equal(market.statusCode, 200);
    assert.equal(market.json().data[0].verifiedSellerCount, 1);
    assert.equal(market.json().data[0].privateSellerCount, 1);
  } finally {
    await app.close();
    await providerServer.close();
  }
});
