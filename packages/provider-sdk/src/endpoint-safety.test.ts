import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertProviderEndpointResolvedSafe,
  assertProviderEndpointSafe,
  isBlockedMetadataHost,
  isPrivateOrSpecialIp,
  UnsafeProviderEndpointError,
  type DnsLookupFn,
} from './endpoint-safety.js';

test('blocks cloud metadata hosts always', () => {
  assert.equal(isBlockedMetadataHost('169.254.169.254'), true);
  assert.equal(isBlockedMetadataHost('metadata.google.internal'), true);
  assert.throws(
    () =>
      assertProviderEndpointSafe('http://169.254.169.254/latest/meta-data', {
        allowPrivateNetwork: true,
        env: { NODE_ENV: 'development' },
      }),
    UnsafeProviderEndpointError
  );
});

test('allows loopback outside production', () => {
  assert.doesNotThrow(() =>
    assertProviderEndpointSafe('http://127.0.0.1:9001/bossraid', {
      env: { NODE_ENV: 'development' },
    })
  );
});

test('blocks private IPs in production without opt-in', () => {
  assert.throws(
    () =>
      assertProviderEndpointSafe('http://10.0.0.5:8080/health', {
        env: { NODE_ENV: 'production' },
      }),
    UnsafeProviderEndpointError
  );
});

test('allows private IPs in production with explicit opt-in', () => {
  assert.doesNotThrow(() =>
    assertProviderEndpointSafe('http://10.0.0.5:8080/health', {
      env: {
        NODE_ENV: 'production',
        BOSSRAID_ALLOW_PRIVATE_PROVIDER_ENDPOINTS: '1',
      },
    })
  );
});

test('requires https for public production endpoints', () => {
  assert.throws(
    () =>
      assertProviderEndpointSafe('http://seller.example.com/bossraid', {
        env: { NODE_ENV: 'production' },
      }),
    UnsafeProviderEndpointError
  );
  assert.doesNotThrow(() =>
    assertProviderEndpointSafe('https://seller.example.com/bossraid', {
      env: { NODE_ENV: 'production' },
    })
  );
});

test('isPrivateOrSpecialIp covers common ranges', () => {
  assert.equal(isPrivateOrSpecialIp('127.0.0.1'), true);
  assert.equal(isPrivateOrSpecialIp('192.168.1.1'), true);
  assert.equal(isPrivateOrSpecialIp('10.1.2.3'), true);
  assert.equal(isPrivateOrSpecialIp('172.16.0.1'), true);
  assert.equal(isPrivateOrSpecialIp('8.8.8.8'), false);
  assert.equal(isPrivateOrSpecialIp('localhost'), true);
  // Integer form of 127.0.0.1
  assert.equal(isPrivateOrSpecialIp('2130706433'), true);
});

test('assertProviderEndpointResolvedSafe rejects hostname resolving to private IP', async () => {
  const lookup: DnsLookupFn = async () => [{ address: '127.0.0.1', family: 4 }];
  await assert.rejects(
    () =>
      assertProviderEndpointResolvedSafe('https://evil.example/bossraid', {
        allowPrivateNetwork: false,
        env: { NODE_ENV: 'production' },
        lookup,
      }),
    (error: unknown) =>
      error instanceof UnsafeProviderEndpointError && error.message.includes('127.0.0.1')
  );
});

test('assertProviderEndpointResolvedSafe allows hostname resolving to public IP', async () => {
  const lookup: DnsLookupFn = async () => [{ address: '8.8.8.8', family: 4 }];
  await assert.doesNotReject(() =>
    assertProviderEndpointResolvedSafe('https://seller.example.com/bossraid', {
      allowPrivateNetwork: false,
      env: { NODE_ENV: 'production' },
      lookup,
    })
  );
});

test('assertProviderEndpointResolvedSafe allows private resolution when private endpoints allowed', async () => {
  const lookup: DnsLookupFn = async () => [{ address: '10.0.0.5', family: 4 }];
  await assert.doesNotReject(() =>
    assertProviderEndpointResolvedSafe('http://internal.example/bossraid', {
      allowPrivateNetwork: true,
      env: { NODE_ENV: 'development' },
      lookup,
    })
  );
});

test('assertProviderEndpointResolvedSafe blocks metadata IP even when private allowed', async () => {
  const lookup: DnsLookupFn = async () => [{ address: '169.254.169.254', family: 4 }];
  await assert.rejects(
    () =>
      assertProviderEndpointResolvedSafe('http://evil.example/meta', {
        allowPrivateNetwork: true,
        env: { NODE_ENV: 'development' },
        lookup,
      }),
    (error: unknown) =>
      error instanceof UnsafeProviderEndpointError && error.message.includes('169.254.169.254')
  );
});

test('assertProviderEndpointResolvedSafe skips DNS for IP literals', async () => {
  let called = false;
  const lookup: DnsLookupFn = async () => {
    called = true;
    return [{ address: '8.8.8.8', family: 4 }];
  };
  await assert.doesNotReject(() =>
    assertProviderEndpointResolvedSafe('http://127.0.0.1:9001/bossraid', {
      env: { NODE_ENV: 'development' },
      lookup,
    })
  );
  assert.equal(called, false);
});
