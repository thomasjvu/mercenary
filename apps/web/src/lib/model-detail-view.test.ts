import assert from 'node:assert/strict';
import test from 'node:test';
import type { InferenceMarket } from '../api/marketplace.js';
import {
  buildModelDetailStats,
  countTeeSellers,
  resolveModelAttestationProvider,
} from './model-detail-view.js';

const market = {
  modelId: 'gpt-5.5',
  modelProvider: 'openai',
  providerCount: 3,
  activeProviderCount: 2,
  verifiedSellerCount: 1,
  privateSellerCount: 1,
  recentSuccessRate: 0.92,
  p50LatencyMs: 1200,
  p95LatencyMs: 2400,
  cheapestRateUsd: 0.2,
  pricing: {
    declaredUnit: 'task',
    baseInputPer1mUsd: 1,
    baseOutputPer1mUsd: 2,
  },
  sellers: [
    { providerId: 'a', privacy: { teeAttested: true } },
    { providerId: 'b', privacy: { teeAttested: false } },
  ],
} as unknown as InferenceMarket;

test('resolveModelAttestationProvider prefers attestation vendor', () => {
  assert.equal(
    resolveModelAttestationProvider({
      modelId: 'model',
      modelProvider: 'openai',
      attestationVendor: 'phala',
    } as never),
    'phala'
  );
  assert.equal(
    resolveModelAttestationProvider({
      modelId: 'model',
      modelProvider: 'near',
    } as never),
    'near'
  );
  assert.equal(resolveModelAttestationProvider(undefined), 'venice');
});

test('countTeeSellers counts tee-attested sellers only', () => {
  assert.equal(countTeeSellers(market), 1);
});

test('buildModelDetailStats maps market metrics to stat rows', () => {
  const stats = buildModelDetailStats(market);
  assert.equal(stats[0]?.label, 'sellers');
  assert.equal(stats[0]?.value, '2/3');
  assert.equal(stats.find((entry) => entry.label === 'tee')?.value, '1');
  assert.match(stats.find((entry) => entry.label === 'success')?.value ?? '', /92/);
});
