import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateTeePreflight, resolveTeeStatusAfterReceipt } from './inference-playground-tee.js';

test('evaluateTeePreflight blocks invalid attestation', () => {
  const result = evaluateTeePreflight({
    requiresTeeVerify: true,
    strictE2ee: false,
    attestation: { valid: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.message, /not sent/i);
  }
});

test('evaluateTeePreflight blocks strict E2EE without e2eeReady', () => {
  const result = evaluateTeePreflight({
    requiresTeeVerify: true,
    strictE2ee: true,
    attestation: { valid: true, e2eeReady: false },
  });

  assert.equal(result.ok, false);
});

test('evaluateTeePreflight passes valid attestation', () => {
  const result = evaluateTeePreflight({
    requiresTeeVerify: true,
    strictE2ee: false,
    attestation: { valid: true },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.status, 'TEE verified');
  }
});

test('resolveTeeStatusAfterReceipt does not overwrite failed preflight', () => {
  assert.equal(
    resolveTeeStatusAfterReceipt({
      preflightPassed: false,
      receiptId: 'receipt-1',
      currentStatus: 'TEE verification failed',
    }),
    'TEE verification failed'
  );
});

test('resolveTeeStatusAfterReceipt promotes receipt after successful preflight', () => {
  assert.equal(
    resolveTeeStatusAfterReceipt({
      preflightPassed: true,
      receiptId: 'receipt-1',
      currentStatus: 'TEE verified',
    }),
    'TEE verified · inference receipt issued'
  );
});
