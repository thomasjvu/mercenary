import assert from 'node:assert/strict';
import test from 'node:test';
import { buildX402PaymentRequired, readX402Config, requireX402Payment } from './x402.js';

function encodeBase64Json(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

test('x402 defaults to disabled until explicitly enabled', () => {
  const config = readX402Config({});

  assert.equal(config.enabled, false);
  assert.equal(config.facilitatorUrl, undefined);
});

test('x402 can be enabled explicitly on Robinhood rail', () => {
  const config = readX402Config({
    BOSSRAID_X402_ENABLED: 'true',
    BOSSRAID_X402_FACILITATOR_URL: 'http://127.0.0.1:4021',
  });

  assert.equal(config.enabled, true);
  assert.equal(config.facilitatorUrl, 'http://127.0.0.1:4021');
  assert.equal(config.network, 'eip155:4663');
  assert.equal(config.asset, 'usdg');
  assert.equal(config.assetTransferMethod, 'permit2');
});

test('x402 rejects Base network when enabled', () => {
  assert.throws(
    () =>
      readX402Config({
        BOSSRAID_X402_ENABLED: 'true',
        BOSSRAID_X402_NETWORK: 'eip155:8453',
        BOSSRAID_X402_ASSET: 'usdc',
        BOSSRAID_X402_FACILITATOR_URL: 'http://127.0.0.1:4021',
      }),
    /Robinhood/
  );
});

test('x402 rejects PayAI facilitator when enabled', () => {
  assert.throws(
    () =>
      readX402Config({
        BOSSRAID_X402_ENABLED: 'true',
        BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.payai.network',
      }),
    /Marian|PayAI/
  );
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

test('x402 payment requirements use robinhood network alias', () => {
  const paymentRequired = buildX402PaymentRequired({
    route: 'raid',
    env: {
      BOSSRAID_X402_NETWORK: 'eip155:4663',
      BOSSRAID_X402_ASSET: 'usdg',
      BOSSRAID_X402_FACILITATOR_URL: 'http://127.0.0.1:4021',
    },
  });

  assert.equal(paymentRequired.accepts[0]?.network, 'robinhood');
});

test('Marian facilitator settle path uses configured facilitator URL', async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];

  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    requests.push({ url, body });

    const payload =
      requests.length === 1
        ? { isValid: true, payer: '0xbuyer' }
        : { success: true, transaction: '0xsettled', network: 'eip155:4663' };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
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
        NODE_ENV: 'test',
        BOSSRAID_X402_ENABLED: 'true',
        BOSSRAID_X402_FACILITATOR_URL: 'http://127.0.0.1:4021',
        BOSSRAID_X402_NETWORK: 'eip155:4663',
        BOSSRAID_X402_ASSET: 'usdg',
        BOSSRAID_X402_PAY_TO: '0xabc',
        BOSSRAID_X402_REQUIRE_ONCHAIN_VERIFY: '0',
      },
    });

    assert.equal(result.settlement?.success, true);
    assert.equal(requests.length, 2);
    assert.equal(requests[0]?.url, 'http://127.0.0.1:4021/verify');
    assert.equal(requests[1]?.url, 'http://127.0.0.1:4021/settle');

    const paymentRequirements = requests[0]?.body.paymentRequirements as Record<string, unknown>;
    assert.equal(paymentRequirements.network, 'robinhood');
    assert.equal(
      String(paymentRequirements.asset).toLowerCase(),
      '0x5fc5360d0400a0fd4f2af552add042d716f1d168'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
