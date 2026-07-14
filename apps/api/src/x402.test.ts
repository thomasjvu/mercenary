import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { buildX402PaymentRequired, readX402Config, requireX402Payment } from './x402.js';

function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

function decodeJwtSegment(value: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Record<string, unknown>;
}

function createEd25519Secret(): string {
  const { privateKey } = generateKeyPairSync('ed25519');
  const jwk = privateKey.export({ format: 'jwk' }) as {
    d?: string;
    x?: string;
  };
  if (typeof jwk.d !== 'string' || typeof jwk.x !== 'string') {
    throw new Error('Failed to export Ed25519 JWK components.');
  }
  return Buffer.concat([Buffer.from(jwk.d, 'base64url'), Buffer.from(jwk.x, 'base64url')]).toString(
    'base64'
  );
}

function createPayAISecret(): string {
  const { privateKey } = generateKeyPairSync('ed25519');
  return `payai_sk_${privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64')}`;
}

test('x402 defaults to disabled until explicitly enabled', () => {
  const config = readX402Config({});

  assert.equal(config.enabled, false);
  assert.equal(config.facilitatorUrl, undefined);
});

test('x402 can be enabled explicitly', () => {
  const config = readX402Config({
    BOSSRAID_X402_ENABLED: 'true',
  });

  assert.equal(config.enabled, true);
  // Default facilitator URL still PayAI until Marian URL is set; network defaults to Robinhood.
  assert.equal(config.facilitatorUrl, 'https://facilitator.payai.network');
  assert.equal(config.network, 'eip155:4663');
  assert.equal(config.asset, 'usdg');
});

test('x402 robinhood usdg resolves built-in Global Dollar metadata', () => {
  const required = buildX402PaymentRequired({
    route: 'inference',
    budgetUsd: 0.05,
    env: {
      BOSSRAID_X402_ENABLED: 'true',
      BOSSRAID_X402_NETWORK: 'eip155:4663',
      BOSSRAID_X402_ASSET: 'usdg',
      BOSSRAID_X402_PAY_TO: '0x1111111111111111111111111111111111111111',
      BOSSRAID_X402_FACILITATOR_URL: 'http://127.0.0.1:4021',
    },
  });

  const accept = required.accepts[0];
  assert.ok(accept);
  assert.equal(accept.asset.toLowerCase(), '0x5fc5360d0400a0fd4f2af552add042d716f1d168');
  assert.equal((accept.extra as { name?: string } | undefined)?.name, 'Global Dollar');
  assert.equal((accept.extra as { version?: string } | undefined)?.version, '1');
  assert.equal(accept.network, 'robinhood');
});

test('x402 metamask preset enables erc7710 asset transfer method', () => {
  const config = readX402Config({
    BOSSRAID_X402_ENABLED: 'true',
    BOSSRAID_X402_FACILITATOR_PRESET: 'metamask_base_mainnet',
    BOSSRAID_X402_NETWORK: 'eip155:8453',
    BOSSRAID_X402_ASSET: 'usdc',
  });

  assert.equal(config.assetTransferMethod, 'erc7710');
  assert.match(config.facilitatorUrl ?? '', /tx-sentinel-base-mainnet/);

  const paymentRequired = buildX402PaymentRequired({
    route: 'raid',
    env: {
      BOSSRAID_X402_FACILITATOR_PRESET: 'metamask_base_mainnet',
      BOSSRAID_X402_NETWORK: 'eip155:8453',
      BOSSRAID_X402_ASSET: 'usdc',
    },
  });

  assert.equal(paymentRequired.accepts[0]?.extra?.assetTransferMethod, 'erc7710');
});

test('x402 route surcharges read BOSSRAID_X402_*_SURCHARGE_USD env vars', () => {
  const config = readX402Config({
    BOSSRAID_X402_RAID_SURCHARGE_USD: '0.02',
    BOSSRAID_X402_CHAT_SURCHARGE_USD: '0.003',
  });
  assert.equal(config.routeSurchargeUsd.raid, 0.02);
  assert.equal(config.routeSurchargeUsd.chat, 0.003);
});

test('x402 resource URLs preserve a configured path prefix', () => {
  const paymentRequired = buildX402PaymentRequired({
    route: 'raid',
    env: {
      BOSSRAID_X402_RESOURCE_BASE_URL: 'http://35.198.249.153:8080/api',
    },
  });

  assert.equal(paymentRequired.accepts[0]?.resource, 'http://35.198.249.153:8080/api/v1/raid');
});

test('x402 inference routes bind payment to the discount inference endpoint', () => {
  const paymentRequired = buildX402PaymentRequired({
    route: 'inference',
    env: {
      BOSSRAID_X402_RESOURCE_BASE_URL: 'http://127.0.0.1:8787',
    },
  });

  assert.equal(
    paymentRequired.accepts[0]?.resource,
    'http://127.0.0.1:8787/v1/inference/chat/completions'
  );
  assert.equal(paymentRequired.accepts[0]?.description, 'Boss Raid discount inference request');
});

test('x402 payment requirements use v1 network aliases for evm chains', () => {
  const paymentRequired = buildX402PaymentRequired({
    route: 'raid',
    env: {
      BOSSRAID_X402_NETWORK: 'eip155:84532',
      BOSSRAID_X402_ASSET: 'usdc',
    },
  });

  assert.equal(paymentRequired.accepts[0]?.network, 'base-sepolia');
});

test('CDP facilitator requests include bearer auth and EVM asset metadata', async () => {
  const originalFetch = globalThis.fetch;
  const cdpApiKeyId = 'organizations/test-org/apiKeys/test-key';
  const cdpApiKeySecret = createEd25519Secret();
  const requests: Array<{
    url: string;
    headers: Headers;
    body: Record<string, unknown>;
  }> = [];

  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    requests.push({ url, headers, body });

    const payload =
      requests.length === 1
        ? { isValid: true, payer: '0xbuyer' }
        : { success: true, transaction: '0xsettled', network: 'eip155:84532' };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    });
  };

  try {
    const result = await requireX402Payment({
      route: 'raid',
      headers: {
        'payment-signature': encodeBase64Json({
          proof: 'already-signed-by-buyer',
        }),
      },
      env: {
        BOSSRAID_X402_ENABLED: 'true',
        BOSSRAID_X402_FACILITATOR_URL: 'https://api.cdp.coinbase.com/platform/v2/x402',
        BOSSRAID_X402_NETWORK: 'eip155:84532',
        BOSSRAID_X402_ASSET: 'usdc',
        BOSSRAID_X402_PAY_TO: '0xabc',
        CDP_API_KEY_ID: cdpApiKeyId,
        CDP_API_KEY_SECRET: cdpApiKeySecret,
      },
    });

    assert.equal(result.settlement?.success, true);
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, 'https://api.cdp.coinbase.com/platform/v2/x402/verify');
    assert.equal(requests[1]?.url, 'https://api.cdp.coinbase.com/platform/v2/x402/settle');

    for (const [index, request] of requests.entries()) {
      const authorization = request.headers.get('authorization');
      assert.equal(typeof authorization, 'string');
      assert.equal(request.headers.get('accept'), 'application/json');
      assert.equal(request.headers.get('content-type'), 'application/json');

      const [headerSegment, payloadSegment] = String(authorization)
        .replace(/^Bearer\s+/, '')
        .split('.');
      assert.equal(typeof headerSegment, 'string');
      assert.equal(typeof payloadSegment, 'string');

      const header = decodeJwtSegment(headerSegment);
      const payload = decodeJwtSegment(payloadSegment);
      assert.equal(header.kid, cdpApiKeyId);
      assert.equal(header.typ, 'JWT');
      assert.equal(typeof header.nonce, 'string');
      assert.equal(header.alg, 'EdDSA');
      assert.equal(payload.sub, cdpApiKeyId);
      assert.equal(payload.iss, 'cdp');
      assert.deepEqual(payload.aud, ['cdp_service']);
      assert.deepEqual(payload.uris, [
        `POST api.cdp.coinbase.com/platform/v2/x402/${index === 0 ? 'verify' : 'settle'}`,
      ]);
    }

    const paymentRequirements = requests[0]?.body.paymentRequirements as Record<string, unknown>;
    assert.equal(paymentRequirements.network, 'base-sepolia');
    assert.equal(paymentRequirements.asset, '0x036CbD53842c5426634e7929541eC2318f3dCF7e');
    assert.deepEqual(paymentRequirements.extra, {
      name: 'USDC',
      version: '2',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PayAI facilitator is the default and uses merchant auth when keys are configured', async () => {
  const originalFetch = globalThis.fetch;
  const payaiApiKeyId = 'cmn_test_key';
  const payaiApiKeySecret = createPayAISecret();
  const requests: Array<{
    url: string;
    headers: Headers;
    body: Record<string, unknown>;
  }> = [];

  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    requests.push({ url, headers, body });

    const payload =
      requests.length === 1
        ? { isValid: true, payer: '0xbuyer' }
        : { success: true, transaction: '0xsettled', network: 'eip155:84532' };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'content-type': 'application/json',
      },
    });
  };

  try {
    const result = await requireX402Payment({
      route: 'chat',
      headers: {
        'payment-signature': encodeBase64Json({
          proof: 'already-signed-by-buyer',
        }),
      },
      budgetUsd: 3.5,
      env: {
        BOSSRAID_X402_ENABLED: 'true',
        BOSSRAID_X402_NETWORK: 'eip155:84532',
        BOSSRAID_X402_ASSET: 'usdc',
        BOSSRAID_X402_PAY_TO: '0xabc',
        PAYAI_API_KEY_ID: payaiApiKeyId,
        PAYAI_API_KEY_SECRET: payaiApiKeySecret,
      },
    });

    assert.equal(result.settlement?.success, true);
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, 'https://facilitator.payai.network/verify');
    assert.equal(requests[1]?.url, 'https://facilitator.payai.network/settle');

    for (const request of requests) {
      const authorization = request.headers.get('authorization');
      assert.equal(typeof authorization, 'string');
      const [headerSegment, payloadSegment] = String(authorization)
        .replace(/^Bearer\s+/, '')
        .split('.');
      const header = decodeJwtSegment(headerSegment);
      const payload = decodeJwtSegment(payloadSegment);
      assert.equal(header.kid, payaiApiKeyId);
      assert.equal(header.alg, 'EdDSA');
      assert.equal(payload.sub, payaiApiKeyId);
      assert.equal(payload.iss, 'payai-merchant');
    }

    const paymentRequirements = requests[0]?.body.paymentRequirements as Record<string, unknown>;
    assert.equal(paymentRequirements.network, 'base-sepolia');
    assert.equal(paymentRequirements.maxAmountRequired, '3537020');
    assert.equal(paymentRequirements.price, '$3.5370');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
