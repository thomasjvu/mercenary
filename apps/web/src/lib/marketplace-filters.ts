import type { MarketplaceTrustFilter } from './marketplace-trust.js';

export const MARKETPLACE_FILTER_DEFAULTS = {
  model: '',
  provider: '',
  framework: '',
  trust: 'any' as MarketplaceTrustFilter,
  privacy: 'any',
  verification: 'any',
  budget: '',
};

export type MarketplaceFilters = typeof MARKETPLACE_FILTER_DEFAULTS;

export function hasActiveMarketplaceFilters(filters: MarketplaceFilters): boolean {
  return (
    filters.model.trim() !== '' ||
    filters.provider.trim() !== '' ||
    filters.framework !== '' ||
    filters.trust !== 'any' ||
    filters.privacy !== 'any' ||
    filters.verification !== 'any' ||
    filters.budget.trim() !== ''
  );
}

export function buildMarketplaceQueryParams(filters: MarketplaceFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.model.trim()) params.set('model_id', filters.model.trim());
  if (filters.provider.trim()) params.set('model_provider', filters.provider.trim());
  if (filters.framework) params.set('agent_framework', filters.framework);
  if (filters.privacy === 'strict') params.set('privacy_mode', 'strict');
  if (filters.verification !== 'any') params.set('verification_status', filters.verification);
  if (filters.budget.trim()) params.set('max_budget_usd', filters.budget.trim());
  return params;
}
