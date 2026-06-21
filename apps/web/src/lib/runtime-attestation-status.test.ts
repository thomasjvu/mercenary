import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostAttestationResponse } from '../api/host-attestation.js';
import { deriveHostAttestationStatus } from './runtime-attestation-status.js';

test('deriveHostAttestationStatus treats runtimeSigned without teeVerified as live', () => {
  const data = {
    object: 'host_attestation',
    deploymentTarget: 'eigencompute',
    teePlatform: 'eigencompute',
    verified: false,
    teeVerified: false,
    runtimeSigned: true,
    verifiedAt: '2026-06-21T00:00:00.000Z',
    signedRuntime: {
      signer: '0xSigner00000000000000000000000000000001',
      message: 'runtime',
      messageHash: '0xabc',
      signature: '0xdef',
      payload: {},
    },
  } as unknown as HostAttestationResponse;

  const status = deriveHostAttestationStatus({
    data,
    error: undefined,
  });

  assert.equal(status.status, 'live');
});

test('deriveHostAttestationStatus treats teeVerified with valid quote as live', () => {
  const data = {
    object: 'host_attestation',
    deploymentTarget: 'phala-cvm',
    teePlatform: 'phala',
    verified: true,
    teeVerified: true,
    runtimeSigned: false,
    verifiedAt: '2026-06-21T00:00:00.000Z',
    teeAttestation: {
      providerId: 'host',
      valid: true,
      vendor: 'phala',
      runtimeMode: 'phala-cvm',
      verifiedAt: '2026-06-21T00:00:00.000Z',
    },
  } as unknown as HostAttestationResponse;

  const status = deriveHostAttestationStatus({
    data,
    error: undefined,
  });

  assert.equal(status.status, 'live');
});
