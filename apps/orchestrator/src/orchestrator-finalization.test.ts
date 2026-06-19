import assert from 'node:assert/strict';
import test from 'node:test';
import { RaidDeadlineTimerRegistry } from './raid-timers.js';

test('RaidDeadlineTimerRegistry serializes finalization marks per raid', () => {
  const registry = new RaidDeadlineTimerRegistry();
  assert.equal(registry.tryMarkFinalizing('raid-1'), true);
  assert.equal(registry.tryMarkFinalizing('raid-1'), false);
  registry.unmarkFinalizing('raid-1');
  assert.equal(registry.tryMarkFinalizing('raid-1'), true);
});

test('RaidDeadlineTimerRegistry serializes settlement marks per raid', () => {
  const registry = new RaidDeadlineTimerRegistry();
  assert.equal(registry.tryMarkSettling('raid-1'), true);
  assert.equal(registry.tryMarkSettling('raid-1'), false);
  registry.unmarkSettling('raid-1');
  assert.equal(registry.tryMarkSettling('raid-1'), true);
});
