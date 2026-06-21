import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {
  buildPrivacyAttestation,
  buildSignedDeclaration,
  verifyPhalaTeeAttestation,
} from './attestation.js';

test('buildSignedDeclaration output is stable for fixed inputs', () => {
  const declaration = buildSignedDeclaration({
    providerId: 'provider-a',
    raidId: 'raid-123',
    featuresClaimed: ['tee_attested', 'signed_outputs'],
    featuresVerified: ['tee_attested'],
    teeAttestation: {
      valid: true,
      providerId: 'provider-a',
      verifiedAt: '2026-06-20T00:00:00.000Z',
      vendor: 'phala',
    },
    externalApiCalls: ['https://api.example.test'],
    dataRetained: false,
  });

  assert.equal(
    declaration,
    'PRIVACY_DECLARATION:provider-a|raid-123|tee_attested,signed_outputs|tee_attested|attested|1|false'
  );
});

test('buildPrivacyAttestation wraps declaration fields', () => {
  const attestation = buildPrivacyAttestation({
    providerId: 'provider-b',
    raidId: 'raid-456',
    featuresClaimed: ['tee_attested'],
    featuresVerified: ['tee_attested'],
    teeAttestation: {
      valid: false,
      providerId: 'provider-b',
      verifiedAt: '2026-06-20T00:00:00.000Z',
      vendor: 'phala',
    },
  });

  assert.equal(attestation.providerId, 'provider-b');
  assert.equal(attestation.raidId, 'raid-456');
  assert.match(attestation.signedDeclaration, /^PRIVACY_DECLARATION:/);
  assert.deepEqual(attestation.featuresVerified, ['tee_attested']);
});

test('verifyPhalaTeeAttestation caches only valid quotes', async () => {
  let quoteCalls = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/Info') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ app_id: 'test-app', compose_hash: 'compose-hash' }));
      return;
    }
    if (req.url === '/GetQuote') {
      quoteCalls += 1;
      const quote = Buffer.alloc(160, quoteCalls === 1 ? 1 : 2).toString('base64');
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ quote }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('mock dstack server failed to bind');
  }

  const endpoint = `http://127.0.0.1:${address.port}`;
  const cache = new Map<
    string,
    { result: Awaited<ReturnType<typeof verifyPhalaTeeAttestation>>; expiresAt: number }
  >();
  const previousEndpoint = process.env.DSTACK_SIMULATOR_ENDPOINT;
  process.env.DSTACK_SIMULATOR_ENDPOINT = endpoint;

  try {
    const first = await verifyPhalaTeeAttestation('provider-cache', '', cache, 60_000, {
      reportData: 'cache-test',
      skipCloudVerify: true,
      rpcTimeoutMs: 5_000,
      getQuoteTimeoutMs: 5_000,
    });
    const second = await verifyPhalaTeeAttestation('provider-cache', '', cache, 60_000, {
      reportData: 'cache-test',
      skipCloudVerify: true,
      rpcTimeoutMs: 5_000,
      getQuoteTimeoutMs: 5_000,
    });

    assert.equal(first.valid, true);
    assert.equal(second.valid, true);
    assert.equal(first.signature, second.signature);
    assert.equal(quoteCalls, 1);
    assert.equal(cache.size, 1);
  } finally {
    if (previousEndpoint === undefined) {
      delete process.env.DSTACK_SIMULATOR_ENDPOINT;
    } else {
      process.env.DSTACK_SIMULATOR_ENDPOINT = previousEndpoint;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

test('verifyPhalaTeeAttestation dedupes concurrent calls', async () => {
  let quoteCalls = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/Info') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ app_id: 'dedupe-app' }));
      return;
    }
    if (req.url === '/GetQuote') {
      quoteCalls += 1;
      setTimeout(() => {
        const quote = Buffer.alloc(160, 3).toString('base64');
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ quote }));
      }, 50);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('mock dstack server failed to bind');
  }

  const endpoint = `http://127.0.0.1:${address.port}`;
  const previousEndpoint = process.env.DSTACK_SIMULATOR_ENDPOINT;
  process.env.DSTACK_SIMULATOR_ENDPOINT = endpoint;

  try {
    const [left, right] = await Promise.all([
      verifyPhalaTeeAttestation('provider-dedupe', '', new Map(), 60_000, {
        reportData: 'dedupe-test',
        skipCloudVerify: true,
        rpcTimeoutMs: 5_000,
        getQuoteTimeoutMs: 5_000,
      }),
      verifyPhalaTeeAttestation('provider-dedupe', '', new Map(), 60_000, {
        reportData: 'dedupe-test',
        skipCloudVerify: true,
        rpcTimeoutMs: 5_000,
        getQuoteTimeoutMs: 5_000,
      }),
    ]);

    assert.equal(left.valid, true);
    assert.equal(right.valid, true);
    assert.equal(left.signature, right.signature);
    assert.equal(quoteCalls, 1);
  } finally {
    if (previousEndpoint === undefined) {
      delete process.env.DSTACK_SIMULATOR_ENDPOINT;
    } else {
      process.env.DSTACK_SIMULATOR_ENDPOINT = previousEndpoint;
    }
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
