import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchUpstreamModelsWithFallback } from './adapter-helpers.js';

test('fetchUpstreamModelsWithFallback returns mock models in non-production on upstream failure', async () => {
  const models = await fetchUpstreamModelsWithFallback({
    provider: 'venice',
    apiKey: 'test-key',
    mockModels: [{ id: 'mock-model', displayName: 'Mock Model' }],
    env: { NODE_ENV: 'test' },
    async fetchModels() {
      throw new Error('upstream unavailable');
    },
  });

  assert.deepEqual(models, [{ id: 'mock-model', displayName: 'Mock Model' }]);
});

test('fetchUpstreamModelsWithFallback throws in production on upstream failure', async () => {
  await assert.rejects(
    () =>
      fetchUpstreamModelsWithFallback({
        provider: 'venice',
        apiKey: 'test-key',
        mockModels: [{ id: 'mock-model', displayName: 'Mock Model' }],
        env: { NODE_ENV: 'production' },
        async fetchModels() {
          throw new Error('upstream unavailable');
        },
      }),
    /upstream unavailable/
  );
});
