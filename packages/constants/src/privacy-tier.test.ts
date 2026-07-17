import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMarketplacePrivacyTier } from './privacy-tier.js';

test('resolveMarketplacePrivacyTier prefers e2ee then tee then anonymous', () => {
  assert.equal(resolveMarketplacePrivacyTier({ e2ee: true, teeAttested: true }), 'e2ee');
  assert.equal(resolveMarketplacePrivacyTier({ teeAttested: true }), 'upstream_tee');
  assert.equal(resolveMarketplacePrivacyTier({ privacy: 'private' }), 'anonymous_private');
  assert.equal(resolveMarketplacePrivacyTier({ privacy: 'anonymized' }), 'anonymous_private');
  assert.equal(resolveMarketplacePrivacyTier({ modelProvider: 'xai' }), 'anonymous_private');
  assert.equal(resolveMarketplacePrivacyTier({ modelProvider: 'darkbloom' }), 'anonymous_private');
  assert.equal(resolveMarketplacePrivacyTier({ privacy: 'standard' }), 'standard');
});
