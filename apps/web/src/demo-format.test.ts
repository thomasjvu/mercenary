import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatElapsedMs,
  formatProgress,
  humanizeToolCall,
  mapStatusTone,
  resolveSpecialistProgress,
} from './demo-format.js';

test('formatProgress normalizes fractional and percentage values', () => {
  assert.equal(formatProgress(0.42), '42%');
  assert.equal(formatProgress(75), '75%');
  assert.equal(formatProgress(Number.NaN), null);
});

test('resolveSpecialistProgress maps status labels to progress bars', () => {
  assert.equal(resolveSpecialistProgress('running'), 0.72);
  assert.equal(resolveSpecialistProgress('approved'), 1);
  assert.equal(resolveSpecialistProgress('custom', 0.25), 0.25);
});

test('humanizeToolCall and mapStatusTone normalize demo trace labels', () => {
  assert.equal(humanizeToolCall('provider_http_run'), 'Running');
  assert.equal(mapStatusTone('approved'), 'ready');
  assert.equal(mapStatusTone('provider_offline'), 'offline');
});

test('formatElapsedMs renders sub-second and second durations', () => {
  assert.equal(formatElapsedMs(1_000, 1_250), '250ms');
  assert.equal(formatElapsedMs(0, 5_500), '5.5s');
});
