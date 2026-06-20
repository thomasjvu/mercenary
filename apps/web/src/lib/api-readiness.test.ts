import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReadyNotOkMessage, listFailedReadyGates } from './api-readiness.js';

test('listFailedReadyGates reports false readiness gates', () => {
  const failed = listFailedReadyGates({
    api: true,
    storage: true,
    secretsEncrypted: true,
    providers: true,
    x402: true,
    settlement: false,
    tee: { configured: true, platform: 'phala' },
  });
  assert.deepEqual(failed, ['settlement']);
});

test('buildReadyNotOkMessage includes failed gate labels', () => {
  const message = buildReadyNotOkMessage({
    api: true,
    storage: true,
    secretsEncrypted: true,
    providers: false,
    x402: true,
    settlement: true,
    tee: { configured: true, platform: null },
  });
  assert.match(message, /providers/);
});
