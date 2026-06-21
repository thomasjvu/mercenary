import assert from 'node:assert/strict';
import test from 'node:test';
import type { TeeAttestationResult } from '@bossraid/shared-types';
import { serializeTeeAttestation } from './serializers.js';

test('serializeTeeAttestation backfills explorerUrl from signature', () => {
  const tee: TeeAttestationResult = {
    valid: true,
    providerId: 'provider-1',
    verifiedAt: '2026-06-21T00:00:00.000Z',
    expiresAt: '2026-06-21T01:00:00.000Z',
    vendor: 'phala',
    enclaveHash: 'abc',
    signature: '0xdeadbeef',
    runtimeMode: 'tee',
    notes: [],
    upstreamVendor: 'venice',
    signingAddress: '0x0000000000000000000000000000000000000001',
    e2eeReady: true,
    checks: [],
  };

  const view = serializeTeeAttestation(tee);
  assert.ok(view.explorerUrl);
  assert.match(view.explorerUrl, /quote=/);
});
