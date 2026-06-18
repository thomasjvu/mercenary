import assert from 'node:assert/strict';
import test from 'node:test';
import type { Provider, RaidResult } from '../api';
import { buildReceiptSettlementView } from './receipt-settlement-view.js';

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
  approvedSubmissions: [{ submission: { providerId: 'seller-a' } }],
  routingProof: {
    providers: [
      {
        providerId: 'seller-a',
        privacyFeatures: ['tee_attested', 'signed_outputs'],
        erc8004Registered: true,
        erc8004VerificationStatus: 'verified',
        veniceBacked: true,
        phase: 'primary',
        reasons: [],
        matchedSpecializations: [],
      },
    ],
  },
  synthesizedOutput: {
    contributingProviderIds: ['seller-a'],
    supportingProviderIds: [],
    droppedProviderIds: [],
  },
} as unknown as RaidResult;

test('buildReceiptSettlementView aggregates provider signals', () => {
  const view = buildReceiptSettlementView({ result, providers });

  assert.deepEqual(view.approvedProviders, ['seller-a']);
  assert.equal(view.teeProviderCount, 1);
  assert.equal(view.signedProviderCount, 1);
  assert.equal(view.verifiedErc8004ProviderCount, 1);
  assert.equal(view.veniceProviderCount, 1);
  assert.equal(view.providerMap.get('seller-a')?.displayName, 'Seller A');
});
