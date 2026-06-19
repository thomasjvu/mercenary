import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildChildJobNextAction,
  isTerminalChildJobStatus,
  mapJobLifecycleStatus,
} from './settlement-lifecycle.js';

test('mapJobLifecycleStatus maps known and unknown contract statuses', () => {
  assert.equal(mapJobLifecycleStatus(0), 'open');
  assert.equal(mapJobLifecycleStatus(3), 'completed');
  assert.equal(mapJobLifecycleStatus(99), 'unknown');
});

test('unknown lifecycle status is not terminal', () => {
  assert.equal(isTerminalChildJobStatus('unknown'), false);
});

test('buildChildJobNextAction warns on unknown lifecycle status', () => {
  const message = buildChildJobNextAction('complete', 'unknown', 1_000_000n);
  assert.match(message ?? '', /Unrecognized onchain job status/i);
});
