import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertProviderEndpointSafe,
  isBlockedMetadataHost,
  isPrivateOrSpecialIp,
  UnsafeProviderEndpointError,
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
