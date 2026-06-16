import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRequestModeChipLabel,
  buildRequestModeLabel,
  buildRequestModeSummary,
} from './mercenary-result.js';

test('buildRequestModeLabel maps raid and discount inference lanes', () => {
  assert.equal(buildRequestModeLabel('raid'), 'Mercenary raid');
  assert.equal(buildRequestModeLabel('chat_v1'), 'Discount inference');
});

test('buildRequestModeSummary describes each lane in user-facing copy', () => {
  assert.match(buildRequestModeSummary('raid'), /multi-agent raid/i);
  assert.match(buildRequestModeSummary('chat_v1'), /cheapest eligible verified seller/i);
});

test('buildRequestModeChipLabel uses compact lane labels', () => {
  assert.equal(buildRequestModeChipLabel('raid'), 'mercenary raid');
  assert.equal(buildRequestModeChipLabel('chat_v1'), 'discount inference');
});
