import assert from 'node:assert/strict';
import test from 'node:test';
import { launchPaidMercenaryRaid } from './mercenary-raid-launch.js';

test('launchPaidMercenaryRaid sends Authorization header for API key mode', async () => {
  let authorization: string | null = null;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    const headers = init?.headers;
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      const value = (headers as Record<string, string>).authorization;
      authorization = typeof value === 'string' ? value : null;
    }

    return new Response(
      JSON.stringify({
        id: 'chatcmpl_test',
        object: 'chat.completion',
        created: 1,
        model: 'mercenary-v1',
        choices: [
          { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' },
        ],
      }),
      {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }
    );
  }) as typeof fetch;

  try {
    await launchPaidMercenaryRaid({
      submittedBrief: 'status update',
      maxBudgetUsd: 2,
      paymentMode: 'api_key',
      apiKey: 'br_test_key_value',
    });

    assert.equal(authorization, 'Bearer br_test_key_value');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
