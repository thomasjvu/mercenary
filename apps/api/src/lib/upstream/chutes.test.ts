import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchChutesUpstreamModels, probeChutesChatCompletion } from './chutes.js';

test('Chutes mock mode returns TEE catalog models and chat content', async () => {
  const env = { BOSSRAID_CHUTES_MOCK: '1' };
  const models = await fetchChutesUpstreamModels('cpk_test', { env });
  assert.ok(models.some((model) => model.id.includes('tee') || model.id.includes('TEE')));
  assert.ok(models.some((model) => model.id.includes('DeepSeek') || model.id.includes('Qwen')));

  const chat = await probeChutesChatCompletion({
    apiKey: 'cpk_test',
    modelId: 'tee-qwen3-5-122b',
    env,
  });
  assert.equal(chat.content, 'mock-chutes-response:tee-qwen3-5-122b');
});
