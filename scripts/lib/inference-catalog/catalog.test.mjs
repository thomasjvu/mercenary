import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCatalog, normalizeTiers } from './normalize.mjs';
import { refreshSources, SOURCE_URLS } from './sources.mjs';

const model = {
  id: 'new-chat',
  name: 'New chat',
  modalities: { input: ['text'], output: ['text'] },
  limit: { context: 10000 },
  cost: { input: 1, output: 2 },
};
const sources = (models) => ({
  models: { payload: {} },
  providers: { payload: { openai: { models } }, fetchedAt: '2026-09-26T00:00:00Z' },
});
const overrides = { providerAliases: { openai: 'openai' }, models: {} };

test('imports new priced models and excludes missing prices, embeddings and deprecated models', () => {
  const result = buildCatalog(
    sources({
      a: model,
      b: { ...model, id: 'unpriced', cost: { input: 1 } },
      'embedding-model': { ...model, id: 'embedding-model' },
      d: { ...model, id: 'retired', status: 'deprecated' },
    }),
    overrides
  );
  assert.deepEqual(
    result.catalog.map((m) => m.modelId),
    ['openai/a']
  );
  assert.equal(result.excluded.length, 3);
});

test('metadata cannot confer privacy or a different providers price', () => {
  const data = sources({ a: { ...model, teeAttested: true, e2ee: true, privacy: 'tee' } });
  data.models.payload['openai/a'] = { ...model, cost: { input: 500, output: 500 } };
  const [entry] = buildCatalog(data, overrides).catalog;
  assert.equal(entry.teeAttested, false);
  assert.equal(entry.e2ee, false);
  assert.equal(entry.inputPer1mUsd, 1);
});

test('exact aliases preserve public IDs without duplicate dated models', () => {
  const result = buildCatalog(
    sources({ dated: { ...model, id: 'dated' }, latest: { ...model, id: 'latest' } }),
    { ...overrides, models: { 'openai/dated': { modelId: 'legacy-id', aliases: ['latest'] } } }
  );
  assert.deepEqual(
    result.catalog.map((m) => m.modelId),
    ['legacy-id']
  );
  assert.equal(result.catalog[0].upstreamModelId, 'dated');
});

test('zero prices stay zero and context thresholds are preserved', () => {
  const [entry] = buildCatalog(
    sources({ free: { ...model, cost: { input: 0, output: 0 } } }),
    overrides
  ).catalog;
  assert.equal(entry.inputPer1mUsd, 0);
  assert.deepEqual(
    normalizeTiers({
      input: 1,
      output: 2,
      tiers: [{ input: 2, output: 3, tier: { type: 'context', size: 272000 } }],
    }),
    [{ input: 2, output: 3, aboveInputTokens: 272000 }]
  );
  assert.throws(() => normalizeTiers({ tiers: [{ tier: { type: 'unknown', size: 1 } }] }));
});

test('an unavailable or invalid source preserves the last successful snapshot and its age', async () => {
  const previous = Object.fromEntries(
    Object.entries(SOURCE_URLS).map(([key, url]) => [
      key,
      {
        url,
        fetchedAt: '2026-01-01T00:00:00Z',
        payload:
          key === 'models'
            ? { a: model }
            : key === 'providers'
              ? { openai: { id: 'openai', models: { a: model } } }
              : { data: [model] },
      },
    ])
  );
  const failed = await refreshSources(previous, overrides.providerAliases, async () => {
    throw new Error('offline');
  });
  assert.equal(failed.models.fetchedAt, previous.models.fetchedAt);
  assert.deepEqual(failed.models.payload, previous.models.payload);
  assert.equal(failed.models.error, 'offline');
  const invalid = await refreshSources(
    previous,
    overrides.providerAliases,
    async () => new Response('{}')
  );
  assert.equal(invalid.providers.fetchedAt, previous.providers.fetchedAt);
  assert.match(invalid.providers.error, /invalid/);
});
