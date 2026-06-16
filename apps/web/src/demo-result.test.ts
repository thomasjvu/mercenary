import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDemoModeChipLabel, buildDemoModeLabel, buildDemoModeSummary } from './demo-result.js';

test('buildDemoModeLabel maps raid and discount inference lanes', () => {
  assert.equal(buildDemoModeLabel('raid'), 'Mercenary raid');
  assert.equal(buildDemoModeLabel('chat_v1'), 'Discount inference');
});

test('buildDemoModeSummary describes each lane in user-facing copy', () => {
  assert.match(buildDemoModeSummary('raid'), /multi-agent raid/i);
  assert.match(buildDemoModeSummary('chat_v1'), /cheapest eligible verified seller/i);
});

test('buildDemoModeChipLabel uses compact lane labels', () => {
  assert.equal(buildDemoModeChipLabel('raid'), 'mercenary raid');
  assert.equal(buildDemoModeChipLabel('chat_v1'), 'discount inference');
});
