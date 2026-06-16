import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { API_BASE, fetchMarkets } from '../api';
import { buildInferenceCurlSnippet } from '../lib/inference-curl.js';
import { ApiReadinessBanner } from '../components/system/ApiReadinessBanner.js';
import { EmptyState } from '../components/system/EmptyState.js';
import { FilterChips } from '../components/system/FilterChips.js';
import { FilterSearch } from '../components/system/FilterSearch.js';
import { FilterSelect } from '../components/system/FilterSelect.js';
import { RefinePanel } from '../components/system/RefinePanel.js';
import { buildApiReadinessHint, readApiErrorMessage } from '../lib/api-readiness.js';
import { ModelCatalog } from '../components/marketplace/ModelCatalog.js';
import { MarketStatsRibbon } from '../components/marketplace/MarketStatsRibbon.js';
import { FeaturedModels } from '../components/marketplace/FeaturedModels.js';
import { CurlQuickstart } from '../components/terminal/CurlQuickstart.js';
import { marketMatchesTrustFilter, type MarketplaceTrustFilter } from '../lib/marketplace-trust.js';

const FILTER_DEFAULTS = {
  model: '',
  provider: '',
  framework: '',
  trust: 'any' as MarketplaceTrustFilter,
  privacy: 'any',
  verification: 'any',
  budget: '',
};

type MarketplaceFilters = typeof FILTER_DEFAULTS;

export function MarketplacePage({ onOpenModel }: { onOpenModel: (modelId: string) => void }) {
  const [filters, setFilters] = useState<MarketplaceFilters>(FILTER_DEFAULTS);
  const params = useMemo(() => buildMarketParams(filters), [filters]);
  const filtersActive = useMemo(() => hasActiveFilters(filters), [filters]);
  const markets = useSWR(
    ['markets', params.toString()],
    () => fetchMarkets(Object.fromEntries(params.entries())),
    { refreshInterval: 15_000 }
  );
  const allMarkets = useSWR(['markets', 'all'], () => fetchMarkets(), { refreshInterval: 15_000 });
  const visibleMarkets = markets.data?.data ?? [];
  const trustFilteredMarkets = useMemo(
    () => visibleMarkets.filter((market) => marketMatchesTrustFilter(market, filters.trust)),
    [filters.trust, visibleMarkets]
  );
  const totalMarketCount = allMarkets.data?.data.length ?? 0;
  const spotlightModel = visibleMarkets[0]?.modelId ?? 'gpt-5.5';

  return (
    <section className="beta-page page-flat market-page">
      <ApiReadinessBanner error={markets.error} label="Marketplace unavailable" />
      <MarketStatsRibbon isLoading={markets.isLoading} markets={markets.data} />

      <div className="market-page__spotlight">
        <div className="market-page__spotlight-main">
          <FeaturedModels
            markets={allMarkets.data?.data ?? visibleMarkets}
            onOpenModel={onOpenModel}
          />
        </div>
        <aside className="market-page__spotlight-aside beta-panel">
          <p className="eyebrow">API quickstart</p>
          <CurlQuickstart
            code={buildInferenceCurlSnippet({
              apiBase: API_BASE,
              model: spotlightModel,
              prompt: 'Run on the cheapest verified seller.',
              maxBudgetUsd: 1,
              privacyMode: 'prefer',
              relativePath: true,
            })}
            compact
            runHref={`/playground?model=${encodeURIComponent(spotlightModel)}`}
            theme="raid"
          />
        </aside>
      </div>

      <div className="marketplace-layout market-page__layout">
        <RefinePanel
          aria-label="Marketplace filters"
          isActive={filtersActive}
          onReset={() => setFilters({ ...FILTER_DEFAULTS })}
        >
          <FilterSearch
            label="Search models"
            onChange={(value) => setFilters({ ...filters, model: value })}
            placeholder="gpt-5.5, claude, venice…"
            value={filters.model}
          />

          <FilterChips
            ariaLabel="Trust filter"
            groupLabel="Trust"
            onChange={(value) => setFilters({ ...filters, trust: value })}
            options={[
              { value: 'any', label: 'any' },
              { value: 'tee', label: 'tee' },
              { value: 'e2ee', label: 'e2ee' },
              { value: 'private', label: 'private' },
            ]}
            value={filters.trust}
          />

          <div className="market-filters__row">
            <FilterField
              compact
              label="provider"
              onChange={(value) => setFilters({ ...filters, provider: value })}
              placeholder="openai"
              value={filters.provider}
            />
            <FilterSelect
              compact
              label="framework"
              onChange={(value) => setFilters({ ...filters, framework: value })}
              options={[
                ['', 'any'],
                ['codex', 'codex'],
                ['claude_code', 'claude code'],
                ['openclaw', 'openclaw'],
                ['custom', 'custom'],
              ]}
              value={filters.framework}
            />
          </div>

          <details className="market-filters__advanced">
            <summary>More filters</summary>
            <div className="market-filters__advanced-body">
              <FilterSelect
                compact
                label="privacy"
                onChange={(value) => setFilters({ ...filters, privacy: value })}
                options={[
                  ['any', 'any'],
                  ['strict', 'strict private'],
                ]}
                value={filters.privacy}
              />
              <FilterSelect
                compact
                label="verify"
                onChange={(value) => setFilters({ ...filters, verification: value })}
                options={[
                  ['any', 'any'],
                  ['verified', 'verified'],
                  ['pending', 'pending'],
                  ['failed', 'failed'],
                ]}
                value={filters.verification}
              />
              <FilterField
                compact
                inputMode="decimal"
                label="max budget"
                onChange={(value) => setFilters({ ...filters, budget: value })}
                placeholder="1.00"
                value={filters.budget}
              />
            </div>
          </details>

          {markets.data?.custody ? (
            <p className="market-filters__note">{markets.data.custody.sellerCredentialPolicy}</p>
          ) : null}
        </RefinePanel>

        <div className="market-page__main">
          {markets.error ? (
            <EmptyState
              body={`${readApiErrorMessage(markets.error)} ${buildApiReadinessHint(markets.error)}`}
              title="Marketplace unavailable"
            />
          ) : markets.isLoading ? (
            <EmptyState body="Reading seller order books." title="Loading markets" />
          ) : trustFilteredMarkets.length === 0 ? (
            <EmptyState
              action={
                filtersActive && totalMarketCount > 0 ? (
                  <button
                    className="button"
                    onClick={() => setFilters({ ...FILTER_DEFAULTS })}
                    type="button"
                  >
                    clear filters
                  </button>
                ) : null
              }
              body={
                filtersActive && totalMarketCount > 0
                  ? 'No seller matches this filter, but other models are available.'
                  : 'No seller matches this filter.'
              }
              title="No eligible sellers"
            />
          ) : (
            <ModelCatalog markets={trustFilteredMarkets} onOpenModel={onOpenModel} />
          )}
        </div>
      </div>
    </section>
  );
}

function FilterField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: 'decimal' | 'text';
  compact?: boolean;
}) {
  return (
    <label className={`market-filters__field${compact ? ' market-filters__field--compact' : ''}`}>
      <span>{label}</span>
      <input
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}

function hasActiveFilters(filters: MarketplaceFilters) {
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

function buildMarketParams(filters: MarketplaceFilters) {
  const params = new URLSearchParams();
  if (filters.model.trim()) params.set('model_id', filters.model.trim());
  if (filters.provider.trim()) params.set('model_provider', filters.provider.trim());
  if (filters.framework) params.set('agent_framework', filters.framework);
  if (filters.privacy === 'strict') params.set('privacy_mode', 'strict');
  if (filters.verification !== 'any') params.set('verification_status', filters.verification);
  if (filters.budget.trim()) params.set('max_budget_usd', filters.budget.trim());
  return params;
}
