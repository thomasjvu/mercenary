import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveTeeTrustLevel, teeTrustLabel } from './tee-trust-badge.js';

test('resolveTeeTrustLevel maps catalog and live verify states', () => {
  assert.equal(resolveTeeTrustLevel({}), 'none');
  assert.equal(resolveTeeTrustLevel({ catalogTeeAttested: true }), 'claimed');
  assert.equal(resolveTeeTrustLevel({ liveVerifyValid: true }), 'verified');
  assert.equal(resolveTeeTrustLevel({ liveVerifyValid: false }), 'failed');
  assert.equal(
    resolveTeeTrustLevel({ catalogTeeAttested: true, liveVerifyValid: true }),
    'verified'
  );
});

test('teeTrustLabel includes optional seller count', () => {
  assert.equal(teeTrustLabel('claimed'), 'tee claimed');
  assert.equal(teeTrustLabel('claimed', 3), '3 tee claimed');
  assert.equal(teeTrustLabel('verified'), 'tee verified');
});
