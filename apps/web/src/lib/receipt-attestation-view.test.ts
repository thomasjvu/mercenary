import assert from 'node:assert/strict';
import test from 'node:test';
import type { Provider, RaidResult } from '../api';
import {
  buildReceiptUpstreamAttestations,
  formatPrivacyFeatureLabel,
} from './receipt-attestation-view.js';

const providers = [
  {
    providerId: 'seller-a',
    displayName: 'Seller A',
    status: 'available',
    specializations: ['text'],
    pricePerTaskUsd: 1,
    modelFamily: 'gpt',
  },
] as unknown as Provider[];

const result = {
  approvedSubmissions: [
    {
      submission: {
        providerId: 'seller-a',
        privacyAttestation: {
          providerId: 'seller-a',
          teeAttestation: { quote: 'abc' },
        },
      },
    },
  ],
  settlementExecution: {
    privacyCompliance: {
      providerAttestations: [],
      perProviderCompliance: {
        'seller-a': { passed: true, score: 0.95 },
      },
    },
  },
} as unknown as RaidResult;

test('buildReceiptUpstreamAttestations dedupes provider attestations', () => {
  const rows = buildReceiptUpstreamAttestations({ result, providers });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.providerId, 'seller-a');
  assert.equal(rows[0]?.settlementPassed, true);
  assert.equal(rows[0]?.settlementScore, 0.95);
});

test('formatPrivacyFeatureLabel replaces underscores', () => {
  assert.equal(formatPrivacyFeatureLabel('tee_attested'), 'tee attested');
});
