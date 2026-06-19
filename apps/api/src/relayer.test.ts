import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicSessionCookie, createTestApiServer } from './test/helpers.js';

const RELAYER_URL = 'https://relayer.test';

function installMockRelayerFetch() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith(RELAYER_URL)) {
      return originalFetch(input, init);
    }

    const body = JSON.parse(String(init?.body ?? '{}')) as { method?: string };
    let result: Record<string, unknown> = {};
    if (body.method === 'relayer_send7710Transaction') {
      result = { taskId: 'task-owned' };
    } else if (body.method === 'relayer_getStatus') {
      result = { status: 'Confirmed', transactionHash: '0xabc' };
    }

    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result,
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  };

  return () => {
    globalThis.fetch = originalFetch;
  };
}

test('relayer status rejects uncached tasks before upstream poll', async () => {
  const restoreFetch = installMockRelayerFetch();
  const app = createTestApiServer([], {
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_ONESHOT_RELAYER_URL: RELAYER_URL,
  });

  try {
    const session = await createPublicSessionCookie(app, 0);
    const response = await app.inject({
      method: 'GET',
      url: '/v1/relayer/status/task-missing',
      headers: { cookie: session.cookie },
    });
    assert.equal(response.statusCode, 403);
    assert.match(response.json().message as string, /unknown/i);
  } finally {
    restoreFetch();
    await app.close();
  }
});

test('relayer status rejects tasks owned by another wallet', async () => {
  const restoreFetch = installMockRelayerFetch();
  const app = createTestApiServer([], {
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_ONESHOT_RELAYER_URL: RELAYER_URL,
  });

  try {
    const owner = await createPublicSessionCookie(app, 0);
    const other = await createPublicSessionCookie(app, 1);

    const send = await app.inject({
      method: 'POST',
      url: '/v1/relayer/send',
      headers: { cookie: owner.cookie, 'content-type': 'application/json' },
      payload: { chainId: 8453, token: 'USDC' },
    });
    assert.equal(send.statusCode, 200);

    const status = await app.inject({
      method: 'GET',
      url: '/v1/relayer/status/task-owned',
      headers: { cookie: other.cookie },
    });
    assert.equal(status.statusCode, 403);
  } finally {
    restoreFetch();
    await app.close();
  }
});

test('relayer webhook does not overwrite cached wallet from body', async () => {
  const restoreFetch = installMockRelayerFetch();
  const app = createTestApiServer([], {
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_ONESHOT_RELAYER_URL: RELAYER_URL,
    BOSSRAID_ONESHOT_RELAYER_WEBHOOK_SECRET: 'test-webhook-secret',
  });

  try {
    const owner = await createPublicSessionCookie(app, 2);
    const send = await app.inject({
      method: 'POST',
      url: '/v1/relayer/send',
      headers: { cookie: owner.cookie, 'content-type': 'application/json' },
      payload: { chainId: 8453, token: 'USDC' },
    });
    assert.equal(send.statusCode, 200);

    const webhook = await app.inject({
      method: 'POST',
      url: '/v1/relayer/webhook',
      headers: {
        'content-type': 'application/json',
        'x-bossraid-relayer-webhook-secret': 'test-webhook-secret',
      },
      payload: {
        taskId: 'task-owned',
        status: 'Confirmed',
        wallet: '0xattacker00000000000000000000000000000001',
      },
    });
    assert.equal(webhook.statusCode, 200);

    const status = await app.inject({
      method: 'GET',
      url: '/v1/relayer/status/task-owned',
      headers: { cookie: owner.cookie },
    });
    assert.equal(status.statusCode, 200);
    assert.equal(status.json().status, 'Confirmed');
  } finally {
    restoreFetch();
    await app.close();
  }
});
