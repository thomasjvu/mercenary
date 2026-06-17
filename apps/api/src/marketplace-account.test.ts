import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import type { ProviderAcceptance } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import { NETWORK } from '@bossraid/constants';
import {
  createTestApiServer,
  buildApiServer,
  createProviderProfile,
  createPublicSessionCookie,
  join,
  mkdtemp,
  readFile,
  readyHealth,
  rm,
  tmpdir,
} from './test/helpers.js';

test('public wallet auth creates a session and buyer API keys are hashed and revocable', async () => {
  const app = createTestApiServer([], {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });

  try {
    const session = await createPublicSessionCookie(app);
    const status = await app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: {
        cookie: session.cookie,
      },
    });
    assert.equal(status.statusCode, 200);
    assert.equal(status.json().authenticated, true);
    assert.equal(status.json().wallet, session.wallet);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/buyer/api-keys',
      headers: {
        cookie: session.cookie,
      },
      payload: {
        name: 'Beta buyer key',
        spendLimitUsd: 2,
      },
    });
    assert.equal(created.statusCode, 201);
    assert.match(created.json().apiKey, /^br_/);
    assert.equal(created.json().key.name, 'Beta buyer key');
    assert.equal(created.json().key.spendLimitUsd, 2);
    assert.equal(created.json().key.keyHash, undefined);

    const listed = await app.inject({
      method: 'GET',
      url: '/v1/buyer/api-keys',
      headers: {
        cookie: session.cookie,
      },
    });
    assert.equal(listed.statusCode, 200);
    assert.equal(listed.json().data.length, 1);
    assert.equal(listed.json().data[0].prefix, created.json().key.prefix);

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/v1/buyer/api-keys/${created.json().key.id}`,
      headers: {
        cookie: session.cookie,
      },
    });
    assert.equal(revoked.statusCode, 200);
    assert.equal(revoked.json().revoked, true);
  } finally {
    await app.close();
  }
});

test('public session tokens and buyer key hashes are encrypted in API control state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'bossraid-api-encrypted-state-test-'));
  const sqliteFile = join(dir, 'state.sqlite');
  const env = {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'sqlite',
    BOSSRAID_SQLITE_FILE: sqliteFile,
    BOSSRAID_SECRET_ENCRYPTION_KEY: 'unit-test-api-secret-key',
  };
  const app = createTestApiServer([], env);
  let appClosed = false;

  try {
    const session = await createPublicSessionCookie(app);
    const created = await app.inject({
      method: 'POST',
      url: '/v1/buyer/api-keys',
      headers: {
        cookie: session.cookie,
      },
      payload: {
        name: 'Encrypted buyer key',
        spendLimitUsd: 0.2,
      },
    });
    assert.equal(created.statusCode, 201);

    const sessionToken = session.cookie.match(/bossraid_session=([^;]+)/)?.[1];
    assert.ok(sessionToken);
    const apiKey = created.json().apiKey as string;
    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    const db = new DatabaseSync(sqliteFile);
    const row = db
      .prepare('select snapshot_json from bossraid_api_control_state where key = 1')
      .get() as { snapshot_json?: string } | undefined;
    const raw = row?.snapshot_json ?? '';
    assert.equal(raw.includes(sessionToken), false);
    assert.equal(raw.includes(keyHash), false);
    assert.equal(raw.includes('brenc:v1:'), true);

    await app.close();
    appClosed = true;
    const restored = createTestApiServer([], env);
    try {
      const response = await restored.inject({
        method: 'POST',
        url: '/v1/inference/chat/completions',
        headers: {
          authorization: `Bearer ${apiKey}`,
        },
        payload: {
          model: 'gpt-5.5',
          messages: [{ role: 'user', content: 'Use the encrypted key.' }],
          raid_policy: {
            max_total_cost: 1,
          },
        },
      });
      assert.equal(response.statusCode, 402);
      assert.equal(response.json().error, 'api_key_spend_limit_exceeded');
    } finally {
      await restored.close();
    }
  } finally {
    if (!appClosed) {
      await app.close();
    }
    await rm(dir, { recursive: true, force: true });
  }
});

test('buyer API keys enforce spend caps on discount inference requests', async () => {
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-spend-cap', {
      modelProvider: 'openai',
      modelId: 'gpt-5.5',
      pricePerTaskUsd: 0.25,
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-spend-cap',
      };
    },
    async run(): Promise<void> {},
  };
  const app = createTestApiServer([provider], {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });

  try {
    const session = await createPublicSessionCookie(app);
    const created = await app.inject({
      method: 'POST',
      url: '/v1/buyer/api-keys',
      headers: {
        cookie: session.cookie,
      },
      payload: {
        name: 'Low cap',
        spendLimitUsd: 0.2,
      },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: {
        authorization: `Bearer ${created.json().apiKey}`,
      },
      payload: {
        model: 'gpt-5.5',
        messages: [
          {
            role: 'user',
            content: 'Use the discount inference lane.',
          },
        ],
      },
    });

    assert.equal(response.statusCode, 402);
    assert.equal(response.json().error, 'api_key_spend_limit_exceeded');
  } finally {
    await app.close();
  }
});

test('buyer API keys enforce per-key rate limits before paid execution', async () => {
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-key-rate-limit', {
      modelProvider: 'openai',
      modelId: 'gpt-5.5',
      pricePerTaskUsd: 0.25,
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-key-rate-limit',
      };
    },
    async run(): Promise<void> {},
  };
  const app = createTestApiServer([provider], {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_BUYER_KEY_RATE_LIMIT_MAX: '1',
    BOSSRAID_BUYER_KEY_RATE_LIMIT_WINDOW_MS: '60000',
  });

  try {
    const session = await createPublicSessionCookie(app);
    const created = await app.inject({
      method: 'POST',
      url: '/v1/buyer/api-keys',
      headers: {
        cookie: session.cookie,
      },
      payload: {
        name: 'Rate limited',
        spendLimitUsd: 10,
      },
    });
    const payload = {
      model: 'gpt-5.5',
      messages: [
        {
          role: 'user',
          content: 'Use the discount inference lane.',
        },
      ],
      raid_policy: {
        max_total_cost: 1,
      },
    };
    await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: {
        authorization: `Bearer ${created.json().apiKey}`,
      },
      payload,
    });

    const rateLimited = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: {
        authorization: `Bearer ${created.json().apiKey}`,
      },
      payload,
    });

    assert.equal(rateLimited.statusCode, 429);
    assert.equal(rateLimited.json().error, 'rate_limited');
  } finally {
    await app.close();
  }
});

test('surplus parity: API key skips x402, funds balance, records purchases and seller ledger', async () => {
  const receivedProviders: string[] = [];
  const cheapProvider: RaidProvider = {
    profile: createProviderProfile('provider-parity-cheap', {
      modelProvider: 'openai',
      modelId: 'gpt-5.5',
      pricePerTaskUsd: 0.25,
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(): Promise<ProviderAcceptance> {
      return { accepted: true, providerRunId: 'run-parity-cheap' };
    },
    async run(task, callbacks): Promise<void> {
      receivedProviders.push('provider-parity-cheap');
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-parity-cheap',
        providerRunId: 'run-parity-cheap',
        answerText: 'Parity lane response.',
        explanation: 'Cheap seller served the API-key inference request.',
        confidence: 0.91,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };
  const pausedCheapProvider: RaidProvider = {
    profile: createProviderProfile('provider-parity-paused', {
      modelProvider: 'openai',
      modelId: 'gpt-5.5',
      pricePerTaskUsd: 0.05,
      marketplaceOfferStatus: 'paused',
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
    }),
    async accept(): Promise<ProviderAcceptance> {
      return { accepted: true, providerRunId: 'run-parity-paused' };
    },
    async run(): Promise<void> {
      receivedProviders.push('provider-parity-paused');
    },
  };
  const orchestrator = new BossRaidOrchestrator(
    [pausedCheapProvider, cheapProvider],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        ready: true,
        agentFramework: 'codex',
        modelProvider: 'openai',
        model: 'gpt-5.5',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  const app = buildApiServer(orchestrator, {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'false',
    BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND: 'true',
  });

  try {
    const session = await createPublicSessionCookie(app, 7);
    const funded = await app.inject({
      method: 'POST',
      url: '/v1/buyer/balance/fund',
      headers: { cookie: session.cookie },
      payload: { amountUsd: 5 },
    });
    assert.equal(funded.statusCode, 200);
    assert.equal(funded.json().balanceUsd, 5);

    const created = await app.inject({
      method: 'POST',
      url: '/v1/buyer/api-keys',
      headers: { cookie: session.cookie },
      payload: { name: 'Parity key', spendLimitUsd: 10 },
    });
    const apiKey = created.json().apiKey as string;

    const inference = await app.inject({
      method: 'POST',
      url: '/v1/inference/chat/completions',
      headers: { authorization: `Bearer ${apiKey}` },
      payload: {
        model: 'gpt-5.5',
        messages: [{ role: 'user', content: 'Route through the parity lane.' }],
      },
    });
    assert.equal(inference.statusCode, 200, inference.body);
    assert.deepEqual(receivedProviders, ['provider-parity-cheap']);
    assert.equal(inference.json().bossraid?.selected_seller, 'provider-parity-cheap');
    assert.equal(typeof inference.json().bossraid?.savings_usd, 'number');

    const balance = await app.inject({
      method: 'GET',
      url: '/v1/buyer/balance',
      headers: { cookie: session.cookie },
    });
    assert.equal(balance.statusCode, 200);
    assert.ok(balance.json().balanceUsd < 5);

    const purchases = await app.inject({
      method: 'GET',
      url: '/v1/buyer/purchases',
      headers: { cookie: session.cookie },
    });
    assert.equal(purchases.statusCode, 200);
    assert.equal(purchases.json().data.length, 1);
    assert.equal(purchases.json().data[0].route, 'inference');

    const stats = await app.inject({ method: 'GET', url: '/v1/marketplace/stats' });
    assert.equal(stats.statusCode, 200);
    assert.ok(stats.json().modelsLive >= 1);

    const markets = await app.inject({ method: 'GET', url: '/v1/markets?model_id=gpt-5.5' });
    const listedSellerIds = markets
      .json()
      .data[0].sellers.map((seller: { sellerId: string }) => seller.sellerId);
    assert.equal(listedSellerIds.includes('provider-parity-paused'), false);

    const sellerSession = await createPublicSessionCookie(app, 8);
    await app.inject({
      method: 'POST',
      url: '/v1/seller/providers',
      headers: { cookie: sellerSession.cookie },
      payload: {
        agentId: 'provider-parity-cheap',
        name: 'Parity Cheap Seller',
        endpoint: 'http://127.0.0.1/provider-parity-cheap',
        modelProvider: 'openai',
        modelId: 'gpt-5.5',
        pricing: { pricePerTaskUsd: 0.25 },
        auth: { type: 'none' },
      },
    });
    const earnings = await app.inject({
      method: 'GET',
      url: '/v1/seller/earnings',
      headers: { cookie: sellerSession.cookie },
    });
    assert.equal(earnings.statusCode, 200);
    assert.ok(earnings.json().payoutCount >= 1);
    assert.ok(earnings.json().grossUsd > 0);
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
  }
});
