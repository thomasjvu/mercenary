import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchUpstreamModelsWithFallback } from './adapter-helpers.js';

test('upstream failures cannot silently become mock availability in development', async () => {
  await assert.rejects(
    fetchUpstreamModelsWithFallback({
      provider: 'openai',
      apiKey: 'test-key',
      mockModels: [{ id: 'mock-model' }],
      env: { NODE_ENV: 'development' },
      async fetchModels() {
        throw new Error('upstream unavailable');
      },
    }),
    /upstream unavailable/
  );
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
