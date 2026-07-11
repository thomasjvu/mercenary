import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchXaiUpstreamModels, probeXaiChatCompletion } from './xai.js';

test('xAI mock mode returns catalog-style models and chat content', async () => {
  const env = { BOSSRAID_XAI_MOCK: '1' };
  const models = await fetchXaiUpstreamModels('test-key', { env });
  assert.ok(models.some((model) => model.id === 'grok-4.5'));

  const chat = await probeXaiChatCompletion({
    apiKey: 'test-key',
    modelId: 'grok-4.5',
    env,
  });
  assert.equal(chat.content, 'mock-xai-response:grok-4.5');
});
