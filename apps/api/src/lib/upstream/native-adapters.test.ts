import assert from 'node:assert/strict';
import test from 'node:test';
import { probeOpenAIChatCompletion } from './openai.js';
import { fetchAnthropicUpstreamModels, probeAnthropicChatCompletion } from './anthropic.js';
import { readUpstreamUsage } from './usage.js';

test('OpenAI uses stateless Responses and preserves reasoning/cache token counts', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.ok(String(url).endsWith('/responses'));
    const body = JSON.parse(String(options.body));
    assert.equal(body.store, false);
    assert.equal(body.max_output_tokens, 100);
    assert.equal(body.input[0].role, 'system');
    return Response.json({
      id: 'response-1',
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', content: [{ type: 'output_text', text: 'ok' }] },
      ],
      usage: {
        input_tokens: 20,
        output_tokens: 40,
        input_tokens_details: { cached_tokens: 5 },
        output_tokens_details: { reasoning_tokens: 35 },
      },
    });
  });
  const result = await probeOpenAIChatCompletion({
    apiKey: 'test-key',
    modelId: 'gpt-6-sol',
    env: { NODE_ENV: 'production' },
    chatOptions: {
      max_tokens: 100,
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Hi' },
      ],
    },
  });
  assert.equal(result.content, 'ok');
  assert.equal(result.usage?.outputTokens, 40);
  assert.equal(result.usage?.details?.reasoningTokens, 35);
  assert.equal(result.usage?.details?.cacheReadTokens, 5);
});

test('Anthropic discovers every page and uses native Messages', async (t) => {
  let pages = 0;
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    const uri = new URL(url);
    assert.equal((options.headers as Record<string, string>)['anthropic-version'], '2023-06-01');
    if (uri.pathname.endsWith('/models')) {
      pages++;
      if (pages === 1)
        return Response.json({ data: [{ id: 'first' }], has_more: true, last_id: 'first' });
      assert.equal(uri.searchParams.get('after_id'), 'first');
      return Response.json({ data: [{ id: 'second' }], has_more: false });
    }
    assert.ok(uri.pathname.endsWith('/messages'));
    const body = JSON.parse(String(options.body));
    assert.equal(body.system, 'Be concise.');
    assert.deepEqual(body.messages, [{ role: 'user', content: 'Hi' }]);
    return Response.json({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 20 },
    });
  });
  assert.deepEqual(
    (await fetchAnthropicUpstreamModels('test-key', { env: { NODE_ENV: 'production' } })).map(
      (m) => m.id
    ),
    ['first', 'second']
  );
  const result = await probeAnthropicChatCompletion({
    apiKey: 'test-key',
    modelId: 'claude-sonnet-5',
    env: { NODE_ENV: 'production' },
    chatOptions: {
      messages: [
        { role: 'system', content: 'Be concise.' },
        { role: 'user', content: 'Hi' },
      ],
    },
  });
  assert.equal(result.usage?.inputTokens, 30);
});

test('invalid upstream usage never becomes a zero-cost charge', () => {
  assert.equal(readUpstreamUsage({ input_tokens: -1, output_tokens: 1 }), undefined);
  assert.equal(readUpstreamUsage({ input_tokens: 1 }), undefined);
});
