import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchAnthropicUpstreamModels, probeAnthropicChatCompletion } from './anthropic.js';

test('Anthropic mock mode returns catalog-style models and chat content', async () => {
  const env = { BOSSRAID_ANTHROPIC_MOCK: '1' };
  const models = await fetchAnthropicUpstreamModels('test-key', { env });
  assert.ok(models.some((model) => model.id === 'claude-sonnet-4-5'));

  const chat = await probeAnthropicChatCompletion({
    apiKey: 'test-key',
    modelId: 'claude-sonnet-4-5',
    env,
  });
  assert.equal(chat.content, 'mock-anthropic-response:claude-sonnet-4-5');
});
