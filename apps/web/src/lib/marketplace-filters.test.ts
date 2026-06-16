import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MARKETPLACE_FILTER_DEFAULTS,
  buildMarketplaceQueryParams,
  hasActiveMarketplaceFilters,
} from './marketplace-filters.js';

test('hasActiveMarketplaceFilters detects non-default filters', () => {
  assert.equal(hasActiveMarketplaceFilters(MARKETPLACE_FILTER_DEFAULTS), false);
  assert.equal(hasActiveMarketplaceFilters({ ...MARKETPLACE_FILTER_DEFAULTS, trust: 'tee' }), true);
});

test('buildMarketplaceQueryParams maps filters to API query params', () => {
  const params = buildMarketplaceQueryParams({
    ...MARKETPLACE_FILTER_DEFAULTS,
    model: 'gpt-5.5',
    provider: 'openai',
    framework: 'codex',
    privacy: 'strict',
    verification: 'verified',
    budget: '1.25',
  });

  assert.equal(params.get('model_id'), 'gpt-5.5');
  assert.equal(params.get('model_provider'), 'openai');
  assert.equal(params.get('agent_framework'), 'codex');
  assert.equal(params.get('privacy_mode'), 'strict');
  assert.equal(params.get('verification_status'), 'verified');
  assert.equal(params.get('max_budget_usd'), '1.25');
});
