import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ROBINHOOD_USDG_ADDRESS,
  ROBINHOOD_USDG_EIP712_NAME,
  ROBINHOOD_USDG_EIP712_VERSION,
} from '@bossraid/constants';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import { BossRaidOrchestrator } from '@bossraid/orchestrator';
import type { RaidProvider } from '@bossraid/provider-sdk';
import {
  buildTestApiServer,
  createTestApiServer,
  createProviderProfile,
  createPublicSessionCookie,
  createRaidRequestBody,
  createX402PaidTestEnv,
  encodeBase64Json,
  installMockX402Facilitator,
  readyHealth,
} from './test/helpers.js';

test('POST /v1/chat/completions records escrow funding from prepaid API-key balance', async () => {
  const provider: RaidProvider = {
    profile: createProviderProfile('provider-chat-escrow', {
      outputTypes: ['text', 'json'],
      supportedLanguages: ['text'],
      pricePerTaskUsd: 1,
    }),
    async accept(): Promise<ProviderAcceptance> {
      return { accepted: true, providerRunId: 'run-chat-escrow' };
    },
    async run(task, callbacks): Promise<void> {
      await callbacks.onSubmit({
        raidId: task.raidId,
        providerId: 'provider-chat-escrow',
        providerRunId: 'run-chat-escrow',
        answerText: 'Escrow path works.',
        explanation: 'Chat spawn should persist escrow funding on the raid record.',
        confidence: 0.9,
        filesTouched: [],
        submittedAt: new Date().toISOString(),
      });
    },
  };
  const orchestrator = new BossRaidOrchestrator(
    [provider],
    undefined,
    undefined,
    undefined,
    async (profile) => readyHealth(profile.providerId)
  );
  const app = buildTestApiServer(orchestrator, {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'false',
    BOSSRAID_ALLOW_UNVERIFIED_BALANCE_FUND: 'true',
    BOSSRAID_CHAT_DEFAULT_MAX_TOTAL_COST: '5',
  });

  try {
    const session = await createPublicSessionCookie(app, 9);
    const funded = await app.inject({
      method: 'POST',
      url: '/v1/buyer/balance/fund',
      headers: { cookie: session.cookie },
      payload: { amountUsd: 5 },
    });
    assert.equal(funded.statusCode, 200, funded.body);
    const created = await app.inject({
      method: 'POST',
      url: '/v1/buyer/api-keys',
      headers: { cookie: session.cookie },
      payload: { name: 'Chat escrow', spendLimitUsd: 10 },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: { authorization: `Bearer ${created.json().apiKey}` },
      payload: {
        model: 'mercenary-v1',
        messages: [{ role: 'user', content: 'Audit this escrow funding path.' }],
        raid_policy: { max_agents: 1, max_total_cost: 3 },
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    const raidId = response.json().raid.raid_id as string;
    const raid = orchestrator.getRaid(raidId);
    assert.ok(raid);
    assert.equal(raid.escrowFundingUsd, 3);
  } finally {
    await app.close();
  }
});

test('x402 returns a payment challenge before paid routes execute', async () => {
  const provider = {
    profile: createProviderProfile('provider-paid'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-paid',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const facilitator = installMockX402Facilitator();
  const app = buildTestApiServer(
    new BossRaidOrchestrator([provider], {}, undefined, undefined, async (profile) =>
      readyHealth(profile.providerId)
    ),
    createX402PaidTestEnv()
  );

  try {
    const unpaid = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: createRaidRequestBody(),
    });

    assert.equal(unpaid.statusCode, 402);
    const paymentRequiredHeader = unpaid.headers['payment-required'];
    const reservationHeader = unpaid.headers['x-bossraid-launch-reservation'];
    assert.equal(typeof paymentRequiredHeader, 'string');
    assert.equal(typeof reservationHeader, 'string');
    const paymentRequired = JSON.parse(
      Buffer.from(String(paymentRequiredHeader), 'base64').toString('utf8')
    ) as {
      accepts: Array<Record<string, unknown>>;
    };
    assert.equal(Array.isArray(paymentRequired.accepts), true);
    assert.equal(paymentRequired.accepts[0]?.asset, ROBINHOOD_USDG_ADDRESS);
    assert.deepEqual(paymentRequired.accepts[0]?.extra, {
      name: ROBINHOOD_USDG_EIP712_NAME,
      version: ROBINHOOD_USDG_EIP712_VERSION,
      reservationId: reservationHeader,
    });
    assert.equal(paymentRequired.accepts[0]?.maxAmountRequired, '10110100');
    assert.equal(paymentRequired.accepts[0]?.price, '$10.1101');

    const paid = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      headers: {
        'x-bossraid-launch-reservation': String(reservationHeader),
        'payment-signature': encodeBase64Json({
          proof: 'facilitator-signed-payment',
          payer: 'test-buyer',
        }),
      },
      payload: createRaidRequestBody(),
    });

    assert.equal(paid.statusCode, 200);
    assert.equal(typeof paid.headers['payment-response'], 'string');
    assert.equal(facilitator.requests.length, 2);
  } finally {
    facilitator.restore();
    await app.close();
  }
});

test('x402 reservations hold provider capacity until payment completes', async () => {
  const provider = {
    profile: createProviderProfile('provider-reserved'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-reserved',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const facilitator = installMockX402Facilitator();
  const app = buildTestApiServer(
    new BossRaidOrchestrator([provider], {}, undefined, undefined, async (profile) =>
      readyHealth(profile.providerId)
    ),
    createX402PaidTestEnv()
  );

  try {
    const unpaid = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: createRaidRequestBody(),
    });

    assert.equal(unpaid.statusCode, 402);
    const paymentRequired = JSON.parse(
      Buffer.from(String(unpaid.headers['payment-required']), 'base64').toString('utf8')
    ) as {
      accepts: Array<Record<string, unknown>>;
    };
    assert.ok(paymentRequired.accepts.length > 0);
    const reservationId = String(unpaid.headers['x-bossraid-launch-reservation']);

    const secondRequest = createRaidRequestBody();
    secondRequest.task.title = 'Fix a second button bug';
    const blocked = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: secondRequest,
    });

    assert.equal(blocked.statusCode, 409);
    assert.equal(blocked.headers['payment-required'], undefined);

    const paid = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      headers: {
        'x-bossraid-launch-reservation': reservationId,
        'payment-signature': encodeBase64Json({
          proof: 'facilitator-signed-payment',
          payer: 'test-buyer',
        }),
      },
      payload: createRaidRequestBody(),
    });

    assert.equal(paid.statusCode, 200);
    assert.equal(facilitator.requests.length, 2);
  } finally {
    facilitator.restore();
    await app.close();
  }
});

test('paid x402 requests require the launch reservation header or equivalent payment context', async () => {
  const provider = {
    profile: createProviderProfile('provider-paid-header'),
    async accept(_task: ProviderTaskPackage): Promise<ProviderAcceptance> {
      return {
        accepted: true,
        providerRunId: 'run-paid-header',
      };
    },
    async run(): Promise<void> {
      return;
    },
  };

  const app = buildTestApiServer(
    new BossRaidOrchestrator([provider], {}, undefined, undefined, async (profile) =>
      readyHealth(profile.providerId)
    ),
    createX402PaidTestEnv()
  );

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      headers: {
        'payment-signature': encodeBase64Json({
          proof: 'paid-without-reservation-context',
        }),
      },
      payload: createRaidRequestBody(),
    });

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), {
      error: 'bad_request',
      message:
        'Paid requests must include X-BossRaid-Launch-Reservation from the payment challenge.',
    });
  } finally {
    await app.close();
  }
});

test('x402 preflight still returns 409 when no providers are eligible', async () => {
  const app = createTestApiServer([], {
    ...createX402PaidTestEnv(),
  });

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/raid',
      payload: createRaidRequestBody(),
    });

    assert.equal(response.statusCode, 409);
    assert.equal(response.headers['payment-required'], undefined);
  } finally {
    await app.close();
  }
});
