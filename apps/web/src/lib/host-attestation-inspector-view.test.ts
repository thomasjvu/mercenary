import assert from 'node:assert/strict';
import test from 'node:test';
import type { HostAttestationResponse } from '../api/host-attestation.js';
import type { ReadyResponse } from '../api/health.js';
import { buildHostAttestationInspectorView } from './host-attestation-inspector-view.js';

const readyPhala: ReadyResponse = {
  ok: true,
  gates: {
    api: true,
    storage: true,
    secretsEncrypted: true,
    providers: true,
    x402: true,
    settlement: true,
    tee: {
      configured: true,
      platform: 'phala',
      pathExists: true,
      socketMounted: true,
      mnemonicConfigured: true,
    },
  },
};

test('buildHostAttestationInspectorView shows loading while host attestation fetches', () => {
  const view = buildHostAttestationInspectorView({
    ready: readyPhala,
    readyLoading: false,
    hostAttestation: undefined,
    hostLoading: true,
    hostError: undefined,
    hasRaidContext: false,
  });

  assert.equal(view.headline, 'Phala host runtime');
  assert.match(view.loadingMessage ?? '', /Fetching host attestation/);
  assert.equal(view.chips.find((chip) => chip.label === 'quote')?.value, 'fetching');
});

test('buildHostAttestationInspectorView matches hosted signed-runtime + failed-quote state', () => {
  const hostAttestation = {
    object: 'host_attestation',
    deploymentTarget: 'phala-cvm',
    teePlatform: 'phala',
    verified: false,
    teeVerified: false,
    runtimeSigned: true,
    verifiedAt: '2026-06-25T01:34:47.249Z',
    teeAttestation: {
      valid: false,
      providerId: 'bossraid-host',
      vendor: 'phala',
      runtimeMode: 'phala-cvm',
      verifiedAt: '2026-06-25T01:34:47.249Z',
    },
    signedRuntime: {
      signer: '0xSigner00000000000000000000000000000001',
      message: 'runtime',
      messageHash: '0xabc',
      signature: '0xdef',
      payload: {},
    },
  } as unknown as HostAttestationResponse;

  const view = buildHostAttestationInspectorView({
    ready: readyPhala,
    readyLoading: false,
    hostAttestation,
    hostLoading: false,
    hostError: undefined,
    hasRaidContext: false,
  });

  assert.equal(view.headline, 'Phala host · quote unverified');
  assert.equal(view.chips.find((chip) => chip.label === 'socket')?.value, 'live');
  assert.equal(view.chips.find((chip) => chip.label === 'quote')?.value, 'failed');
  assert.equal(view.chips.find((chip) => chip.label === 'runtime')?.value, 'signed');
  assert.match(view.subline, /cloud verification failed/);
  assert.match(view.hostContextNote, /host proof/);
});

test('buildHostAttestationInspectorView shows verified headline when tee quote passes', () => {
  const view = buildHostAttestationInspectorView({
    ready: readyPhala,
    readyLoading: false,
    hostAttestation: {
      object: 'host_attestation',
      deploymentTarget: 'phala-cvm',
      teePlatform: 'phala',
      verified: true,
      teeVerified: true,
      runtimeSigned: true,
      verifiedAt: '2026-06-25T01:34:47.249Z',
      teeAttestation: {
        valid: true,
        providerId: 'bossraid-host',
        vendor: 'phala',
        runtimeMode: 'phala-cvm',
        verifiedAt: '2026-06-25T01:34:47.249Z',
      },
    } as HostAttestationResponse,
    hostLoading: false,
    hostError: undefined,
    hasRaidContext: false,
  });

  assert.equal(view.headline, 'Phala TEE verified');
  assert.equal(view.chips.find((chip) => chip.label === 'quote')?.value, 'verified');
});
