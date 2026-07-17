import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { ProviderAcceptance, ProviderTaskPackage } from '@bossraid/shared-types';
import type { RaidProvider } from '@bossraid/provider-sdk';
import {
  createProviderProfile,
  createPublicSessionCookie,
  createTestApiServer,
  createX402PaidTestEnv,
  encodeBase64Json,
  injectWithPublicSession,
  installMockX402Facilitator,
} from './test/helpers.js';

const TEST_PROVIDER_ID = 'bounty-route-provider';

function bountyProvider(): RaidProvider {
  return {
    profile: createProviderProfile(TEST_PROVIDER_ID, {
      auth: { type: 'bearer', token: 'bounty-provider-token' },
    }),
    async accept(): Promise<ProviderAcceptance> {
      return { accepted: true, providerRunId: 'bounty-run' };
    },
    async run(): Promise<void> {},
  };
}

test('production onchain fund rejects when bounty escrow is not configured', async () => {
  const app = createTestApiServer([bountyProvider()], {
    NODE_ENV: 'production',
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_SETTLEMENT_MODE: 'onchain',
    BOSSRAID_RPC_URL: 'http://127.0.0.1:8545',
    BOSSRAID_CHAIN_ID: '4663',
    BOSSRAID_REGISTRY_ADDRESS: '0x0000000000000000000000000000000000000101',
    BOSSRAID_ESCROW_ADDRESS: '0x0000000000000000000000000000000000000102',
    BOSSRAID_TOKEN_ADDRESS: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    BOSSRAID_EVALUATOR_ADDRESS: '0x0000000000000000000000000000000000000103',
    BOSSRAID_CLIENT_PRIVATE_KEY:
      '0x0000000000000000000000000000000000000000000000000000000000000001',
    BOSSRAID_X402_ENABLED: 'false',
    BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND: 'true',
  });

  try {
    const session = await createPublicSessionCookie(app, 3);
    const created = await app.inject({
      method: 'POST',
      url: '/v1/bounties',
      headers: { cookie: session.cookie },
      payload: {
        title: 'Escrow gate',
        description: 'Test',
        requirements: 'Test',
        rewardAmountUsd: 1,
      },
    });
    assert.equal(created.statusCode, 201);
    const bountyId = created.json().bounty.id as string;

    const funded = await app.inject({
      method: 'POST',
      url: `/v1/bounties/${bountyId}/fund`,
      headers: { cookie: session.cookie },
      payload: { openNow: true },
    });
    assert.equal(funded.statusCode, 503);
    assert.equal(funded.json().error, 'bounty_escrow_unconfigured');
  } finally {
    await app.close();
  }
});

test('off-chain bounty lifecycle works over HTTP with unverified fund bypass', async () => {
  const app = createTestApiServer([bountyProvider()], {
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_X402_ENABLED: 'false',
    BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND: 'true',
  });

  try {
    const session = await createPublicSessionCookie(app, 4);
    const created = await injectWithPublicSession(
      app,
      {
        method: 'POST',
        url: '/v1/bounties',
        payload: {
          title: 'HTTP bounty',
          description: 'Route test',
          requirements: 'curl',
          rewardAmountUsd: 5,
        },
      },
      4
    );
    assert.equal(created.statusCode, 201);
    const bountyId = created.json().bounty.id as string;

    const funded = await injectWithPublicSession(
      app,
      {
        method: 'POST',
        url: `/v1/bounties/${bountyId}/fund`,
        payload: { openNow: true },
      },
      4
    );
    assert.equal(funded.statusCode, 200);

    const bid = await app.inject({
      method: 'POST',
      url: `/v1/bounties/${bountyId}/bids`,
      headers: { authorization: 'Bearer bounty-provider-token' },
      payload: {
        providerId: TEST_PROVIDER_ID,
        priceUsd: 5,
        etaHours: 2,
        pitch: 'I can ship this.',
      },
    });
    assert.equal(bid.statusCode, 201);

    const awarded = await injectWithPublicSession(
      app,
      {
        method: 'POST',
        url: `/v1/bounties/${bountyId}/award`,
        payload: { bidIds: [bid.json().bid.id] },
      },
      4
    );
    assert.equal(awarded.statusCode, 200);

    const awardId = awarded.json().awards[0].id as string;
    const artifactsJson = JSON.stringify({ ok: true });
    const delivered = await app.inject({
      method: 'POST',
      url: `/v1/bounties/${bountyId}/awards/${awardId}/deliver`,
      headers: { authorization: 'Bearer bounty-provider-token' },
      payload: {
        artifactSummary: 'done',
        artifactsJson,
        deliveryHash: createHash('sha256').update(artifactsJson).digest('hex'),
      },
    });
    assert.equal(delivered.statusCode, 200);

    const accepted = await injectWithPublicSession(
      app,
      {
        method: 'POST',
        url: `/v1/bounties/${bountyId}/awards/${awardId}/accept`,
      },
      4
    );
    assert.equal(accepted.statusCode, 200);
    assert.equal(accepted.json().award.status, 'paid');
  } finally {
    await app.close();
  }
});

test('bounty fund rejects client-supplied escrow proof when x402 is enabled', async () => {
  const app = createTestApiServer([bountyProvider()], {
    ...createX402PaidTestEnv(),
    BOSSRAID_STORAGE_BACKEND: 'memory',
  });

  try {
    const session = await createPublicSessionCookie(app, 6);
    const created = await app.inject({
      method: 'POST',
      url: '/v1/bounties',
      headers: { cookie: session.cookie },
      payload: {
        title: 'Escrow proof gate',
        description: 'Test',
        requirements: 'Test',
        rewardAmountUsd: 2,
      },
    });
    assert.equal(created.statusCode, 201);
    const bountyId = created.json().bounty.id as string;

    const rejected = await app.inject({
      method: 'POST',
      url: `/v1/bounties/${bountyId}/fund`,
      headers: { cookie: session.cookie },
      payload: {
        openNow: true,
        escrowJobId: 'forged-escrow',
      },
    });
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.json().error, 'client_escrow_proof_rejected');
  } finally {
    await app.close();
  }
});

test('bounty fund returns x402 challenge when payments are enabled', async () => {
  const app = createTestApiServer([bountyProvider()], {
    ...createX402PaidTestEnv(),
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND: 'false',
  });
  let facilitator: ReturnType<typeof installMockX402Facilitator> | undefined;

  try {
    const session = await createPublicSessionCookie(app, 5);
    facilitator = installMockX402Facilitator({ payer: session.wallet });
    const created = await app.inject({
      method: 'POST',
      url: '/v1/bounties',
      headers: { cookie: session.cookie },
      payload: {
        title: 'Paid bounty',
        description: 'x402',
        requirements: 'pay',
        rewardAmountUsd: 2,
      },
    });
    const bountyId = created.json().bounty.id as string;

    const challenge = await app.inject({
      method: 'POST',
      url: `/v1/bounties/${bountyId}/fund`,
      headers: { cookie: session.cookie },
      payload: { openNow: true },
    });
    assert.equal(challenge.statusCode, 402);
    assert.equal(typeof challenge.headers['payment-required'], 'string');

    const paid = await app.inject({
      method: 'POST',
      url: `/v1/bounties/${bountyId}/fund`,
      headers: {
        cookie: session.cookie,
        'payment-signature': encodeBase64Json({
          proof: 'facilitator-signed-payment',
          payer: session.wallet,
        }),
      },
      payload: { openNow: true },
    });
    assert.equal(paid.statusCode, 200);
    assert.equal(paid.json().bounty.status, 'open');
    assert.equal(facilitator!.requests.length, 2);
  } finally {
    facilitator?.restore();
    await app.close();
  }
});
