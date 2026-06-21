import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { mnemonicToAccount } from 'viem/accounts';
import { createTestApiServer, TEST_MNEMONIC } from './test/helpers.js';

function startMockDstackSocket(socketPath: string): net.Server {
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) {
        return;
      }
      const headerText = buffer.slice(0, headerEnd);
      const bodyStart = headerEnd + 4;
      const pathMatch = headerText.match(/^POST (\S+)/m);
      const path = pathMatch?.[1] ?? '';
      const match = headerText.match(/^content-length:\s*(\d+)$/im);
      const contentLength = match ? Number(match[1]) : 0;
      const body = buffer.slice(bodyStart);
      if (body.length < contentLength) {
        return;
      }

      const payload =
        path === '/Info'
          ? JSON.stringify({ app_id: 'host-route-test', compose_hash: 'compose-hash' })
          : JSON.stringify({ quote: Buffer.alloc(160, 4).toString('base64') });
      const response = [
        'HTTP/1.1 200 OK',
        'Content-Type: application/json',
        `Content-Length: ${Buffer.byteLength(payload)}`,
        '',
        payload,
      ].join('\r\n');
      socket.end(response);
      buffer = '';
    });
  });
  server.listen(socketPath);
  return server;
}

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
      teeVerified: boolean;
      runtimeSigned: boolean;
      signedRuntime?: { signer: string; signature: string };
      teeAttestation?: unknown;
    };
    assert.equal(body.object, 'host_attestation');
    assert.equal(body.verified, false);
    assert.equal(body.teeVerified, false);
    assert.equal(body.runtimeSigned, true);
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

test('GET /v1/host/attestation does not mark verified from signedRuntime alone', async () => {
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
      verified: boolean;
      teeVerified: boolean;
      runtimeSigned: boolean;
      signedRuntime?: unknown;
      teeAttestation?: unknown;
    };
    assert.ok(body.signedRuntime);
    assert.equal(body.teeAttestation, undefined);
    assert.equal(body.verified, false);
    assert.equal(body.teeVerified, false);
    assert.equal(body.runtimeSigned, true);
  } finally {
    await app.close();
  }
});

test('GET /v1/host/attestation returns teeVerified when Phala mock quote succeeds', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'bossraid-dstack-'));
  const socketPath = join(tempDir, 'dstack.sock');
  const server = startMockDstackSocket(socketPath);
  const previousSkipCloud = process.env.BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY;
  process.env.BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY = '1';

  const app = createTestApiServer([], {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_DEPLOY_TARGET: 'phala-cvm',
    BOSSRAID_TEE_PLATFORM: 'phala',
    BOSSRAID_TEE_SOCKET_PATH: socketPath,
  });

  try {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/host/attestation',
    });

    assert.equal(response.statusCode, 200);
    const body = response.json() as {
      verified: boolean;
      teeVerified: boolean;
      runtimeSigned: boolean;
      teeAttestation?: { valid: boolean; signature?: string };
    };
    assert.equal(body.teeVerified, true);
    assert.equal(body.verified, true);
    assert.equal(body.runtimeSigned, false);
    assert.equal(body.teeAttestation?.valid, true);
    assert.ok(body.teeAttestation?.signature);
  } finally {
    await app.close();
    if (previousSkipCloud === undefined) {
      delete process.env.BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY;
    } else {
      process.env.BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY = previousSkipCloud;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('GET /v1/host/attestation tolerates rapid repeat requests', async () => {
  const app = createTestApiServer([], {
    ...process.env,
    BOSSRAID_STORAGE_BACKEND: 'memory',
    BOSSRAID_DEPLOY_TARGET: 'eigencompute',
    BOSSRAID_TEE_PLATFORM: 'eigencompute',
    MNEMONIC: TEST_MNEMONIC,
  });

  try {
    const [first, second] = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/host/attestation' }),
      app.inject({ method: 'GET', url: '/v1/host/attestation' }),
    ]);

    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal(first.json().object, 'host_attestation');
    assert.equal(second.json().object, 'host_attestation');
  } finally {
    await app.close();
  }
});
