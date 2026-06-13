import assert from 'node:assert/strict';
import test from 'node:test';
import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';

test('INFERENCE_MODEL_CATALOG modelId values are unique', () => {
  const seen = new Set<string>();
  for (const entry of INFERENCE_MODEL_CATALOG) {
    assert.equal(seen.has(entry.modelId), false, `duplicate modelId: ${entry.modelId}`);
    seen.add(entry.modelId);
  }
});
