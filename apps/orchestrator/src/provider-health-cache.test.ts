import assert from 'node:assert/strict';
import test from 'node:test';
import type { ProviderHealthStatus, ProviderProfile } from '@bossraid/shared-types';
import {
  DEFAULT_PROVIDER_HEALTH_CACHE_TTL_MS,
  ProviderHealthCache,
} from './provider-health-cache.js';

function createProvider(providerId: string): ProviderProfile {
  return {
    providerId,
    displayName: providerId,
    endpointType: 'http',
    endpoint: `http://127.0.0.1:9000/${providerId}`,
    specializations: [],
    supportedLanguages: ['typescript'],
    supportedFrameworks: [],
    pricePerTaskUsd: 1,
    maxConcurrency: 1,
    status: 'available',
    reputation: {
      globalScore: 0,
      responsivenessScore: 0,
      validityScore: 0,
      qualityScore: 0,
      timeoutRate: 0,
      duplicateRate: 0,
      specializationScores: {},
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      totalRaids: 0,
      totalSuccessfulRaids: 0,
    },
  };
}

test('ProviderHealthCache reuses cached health within the TTL', async () => {
  let probeCalls = 0;
  const health: ProviderHealthStatus = {
    providerId: 'provider-a',
    endpoint: 'http://127.0.0.1:9000/provider-a',
    reachable: true,
    ready: true,
  };
  const cache = new ProviderHealthCache(5_000, async () => {
    probeCalls += 1;
    return health;
  });
  const provider = createProvider('provider-a');

  const first = await cache.read(provider, 1_000);
  const second = await cache.read(provider, 2_000);

  assert.equal(first.ready, true);
  assert.equal(second.ready, true);
  assert.equal(probeCalls, 1);
});

test('ProviderHealthCache probes again after TTL expiry', async () => {
  let probeCalls = 0;
  const cache = new ProviderHealthCache(1_000, async (profile) => {
    probeCalls += 1;
    return {
      providerId: profile.providerId,
      endpoint: profile.endpoint,
      reachable: probeCalls === 1,
      ready: probeCalls === 1,
    };
  });
  const provider = createProvider('provider-b');

  const first = await cache.read(provider, 0);
  const second = await cache.read(provider, DEFAULT_PROVIDER_HEALTH_CACHE_TTL_MS + 1);

  assert.equal(first.ready, true);
  assert.equal(second.ready, false);
  assert.equal(probeCalls, 2);
});

test('ProviderHealthCache delete invalidates cached health', async () => {
  let probeCalls = 0;
  const cache = new ProviderHealthCache(5_000, async (profile) => {
    probeCalls += 1;
    return {
      providerId: profile.providerId,
      endpoint: profile.endpoint,
      reachable: true,
      ready: probeCalls === 1,
    };
  });
  const provider = createProvider('provider-c');

  await cache.read(provider, 0);
  cache.delete('provider-c');
  const refreshed = await cache.read(provider, 100);

  assert.equal(refreshed.ready, false);
  assert.equal(probeCalls, 2);
});
