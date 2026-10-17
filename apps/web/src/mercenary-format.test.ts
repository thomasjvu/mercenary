import assert from 'node:assert/strict';
import test from 'node:test';
import { formatProgress } from './mercenary-format.js';

test('formatProgress normalizes fractional and percentage values', () => {
  assert.equal(formatProgress(0.42), '42%');
  assert.equal(formatProgress(75), '75%');
  assert.equal(formatProgress(Number.NaN), null);
});
