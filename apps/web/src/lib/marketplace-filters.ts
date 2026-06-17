import type { MarketplaceTrustFilter } from './marketplace-trust.js';

export const MARKETPLACE_SORT_OPTIONS = [
  ['price', 'cheapest first'],
  ['sellers', 'most sellers'],
  ['success', 'success rate'],
  ['latency', 'p50 latency'],
  ['model', 'model id'],
] as const;

export type MarketplaceSortKey = (typeof MARKETPLACE_SORT_OPTIONS)[number][0];

export const MARKETPLACE_FILTER_DEFAULTS = {
  model: '',
  provider: '',
  framework: '',
  trust: 'any' as MarketplaceTrustFilter,
  privacy: 'any',
  verification: 'any',
  budget: '',
  sort: 'price' as MarketplaceSortKey,
};

export type MarketplaceFilters = typeof MARKETPLACE_FILTER_DEFAULTS;

export const MARKETPLACE_TRUST_OPTIONS = [
  { value: 'any', label: 'any' },
  { value: 'tee', label: 'tee' },
  { value: 'e2ee', label: 'e2ee' },
  { value: 'private', label: 'private' },
] as const;

export const MARKETPLACE_FRAMEWORK_OPTIONS = [
  ['', 'any'],
  ['codex', 'codex'],
  ['claude_code', 'claude code'],
  ['openclaw', 'openclaw'],
  ['custom', 'custom'],
] as const;

export const MARKETPLACE_PRIVACY_OPTIONS = [
  ['any', 'any'],
  ['strict', 'strict private'],
] as const;

export const MARKETPLACE_VERIFICATION_OPTIONS = [
  ['any', 'any'],
  ['verified', 'verified'],
  ['pending', 'pending'],
  ['failed', 'failed'],
] as const;

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
