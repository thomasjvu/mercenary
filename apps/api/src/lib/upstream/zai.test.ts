import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchZaiUpstreamModels, probeZaiChatCompletion } from './zai.js';

test('Z.ai mock mode returns catalog-style models and chat content', async () => {
  const env = { BOSSRAID_ZAI_MOCK: '1' };
  const models = await fetchZaiUpstreamModels('test-key', { env });
  assert.ok(models.some((model) => model.id === 'glm-4.7'));

  const chat = await probeZaiChatCompletion({
    apiKey: 'test-key',
    modelId: 'glm-4.7',
    env,
  });
  assert.equal(chat.content, 'mock-zai-response:glm-4.7');
});
