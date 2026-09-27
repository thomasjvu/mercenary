import assert from 'node:assert/strict';
import test from 'node:test';
import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import { mergeUpstreamCatalogModelsForProvider } from './catalog-merge.js';

test('live unknown models cannot publish and catalog absence never implies account access', () => {
  const [known, missing] = INFERENCE_MODEL_CATALOG.filter((m) => m.modelProvider === 'openai');
  const rows = mergeUpstreamCatalogModelsForProvider('openai', [
    { id: known.upstreamModelId },
    { id: 'new-unknown' },
  ]);
  assert.equal(rows.find((m) => m.modelId === known.modelId)?.offerable, true);
  assert.equal(rows.find((m) => m.modelId === missing.modelId)?.offerable, false);
  const unknown = rows.find((m) => m.upstreamModelId === 'new-unknown');
  assert.equal(unknown?.state, 'live_unpriced');
  assert.equal(unknown?.offerable, false);
  assert.equal(unknown?.referenceInputPer1mUsd, null);
});
