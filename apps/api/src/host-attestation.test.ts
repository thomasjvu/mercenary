import assert from 'node:assert/strict';
import test from 'node:test';
import { mnemonicToAccount } from 'viem/accounts';
import { createTestApiServer, TEST_MNEMONIC } from './test/helpers.js';

test('GET /v1/host/attestation is public and returns signed runtime when MNEMONIC is configured', async () => {
  const app = createTestApiServer([], {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_DEPLOY_TARGET: 'eigencompute',
    BOSSRAID_TEE_PLATFORM: 'eigencompute',
    MNEMONIC: TEST_MNEMONIC,
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/host/attestation',
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      object: string;
      verified: boolean;
      signedRuntime?: { signer: string; signature: string };
      teeAttestation?: unknown;
    };
    assert.equal(body.object, 'host_attestation');
    assert.equal(body.verified, true);
    assert.ok(body.signedRuntime);
    assert.equal(body.signedRuntime?.signer, mnemonicToAccount(TEST_MNEMONIC).address);
    assert.equal(body.teeAttestation, undefined);
  } finally {
    await app.close();
  }
});

test('GET /v1/host/attestation returns 503 on Phala when tappd socket is unavailable', async () => {
  const app = createTestApiServer([], {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_DEPLOY_TARGET: 'phala-cvm',
    BOSSRAID_TEE_PLATFORM: 'phala',
    BOSSRAID_TEE_SOCKET_PATH: '/tmp/bossraid-missing-tappd.sock',
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/host/attestation',
    });

    assert.equal(response.statusCode, 503);
    assert.equal(response.json().error, 'tee_unavailable');
  } finally {
    await app.close();
  }
});
