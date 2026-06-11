import assert from 'node:assert/strict';
import test from 'node:test';
import { mapContractErrorCode } from './contract-errors.js';

test('mapContractErrorCode maps status codes to stable error keys', () => {
  assert.equal(mapContractErrorCode(400), 'bad_request');
  assert.equal(mapContractErrorCode(401), 'unauthorized');
  assert.equal(mapContractErrorCode(402), 'payment_required');
  assert.equal(mapContractErrorCode(403), 'forbidden');
  assert.equal(mapContractErrorCode(404), 'not_found');
  assert.equal(mapContractErrorCode(409), 'conflict');
  assert.equal(mapContractErrorCode(429), 'rate_limited');
  assert.equal(mapContractErrorCode(502), 'bad_gateway');
  assert.equal(mapContractErrorCode(503), 'service_unavailable');
  assert.equal(mapContractErrorCode(418), 'bad_request');
});
