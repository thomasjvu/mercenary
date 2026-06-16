import assert from 'node:assert/strict';
import test from 'node:test';
import type { Provider } from '../api/client.js';
import {
  filterHostedInferenceOffers,
  formatHostedOfferPricing,
  isHostedInferenceOffer,
  resolveHostedOfferUpstream,
} from './seller-offers.js';

const hostedOffer = {
  providerId: 'seller-1',
  displayName: 'Hosted seller',
  status: 'available',
  specializations: ['text'],
  pricePerTaskUsd: 0.5,
  source: { type: 'inference_hosted', targetType: 'redpill' },
  modelProvider: 'redpill',
  modelId: 'claude-sonnet',
} as Provider;

test('isHostedInferenceOffer detects hosted source types', () => {
  assert.equal(isHostedInferenceOffer({ source: { type: 'inference_hosted' } }), true);
  assert.equal(isHostedInferenceOffer({ source: { type: 'venice_hosted' } }), true);
  assert.equal(isHostedInferenceOffer({ source: { type: 'http_worker' } }), false);
});

test('resolveHostedOfferUpstream prefers targetType and venice_hosted fallback', () => {
  assert.equal(
    resolveHostedOfferUpstream({ type: 'inference_hosted', targetType: 'near' }),
    'near'
  );
  assert.equal(resolveHostedOfferUpstream({ type: 'venice_hosted' }), 'venice');
  assert.equal(resolveHostedOfferUpstream(undefined, 'chutes'), 'chutes');
  assert.equal(resolveHostedOfferUpstream(undefined), 'venice');
});

test('filterHostedInferenceOffers keeps only hosted sellers', () => {
  const offers = filterHostedInferenceOffers([
    hostedOffer,
    {
      ...hostedOffer,
      providerId: 'seller-2',
      source: { type: 'http_worker' },
    } as Provider,
  ]);

  assert.equal(offers.length, 1);
  assert.equal(offers[0]?.providerId, 'seller-1');
});

test('formatHostedOfferPricing renders token metered and task pricing', () => {
  assert.match(
    formatHostedOfferPricing({
      ...hostedOffer,
      pricing: {
        mode: 'token_metered',
        pricePer1mInputTokensUsd: 1.25,
        pricePer1mOutputTokensUsd: 2.5,
      },
    }),
    /\$1\.250 \/ \$2\.500 per M/
  );
  assert.equal(formatHostedOfferPricing(hostedOffer), '$0.50 per task');
});
