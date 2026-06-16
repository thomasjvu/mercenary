import { useMemo, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { API_BASE, fetchMarkets } from '../api';
import { buildInferenceCurlSnippet } from '../lib/inference-curl.js';
import { ApiReadinessBanner } from '../components/system/ApiReadinessBanner.js';
import { buildApiReadinessHint, readApiErrorMessage } from '../lib/api-readiness.js';
import { MarketDiscountChart } from '../components/marketplace/MarketDiscountChart.js';
import { MarketSavingsSummary } from '../components/marketplace/MarketSavingsSummary.js';
import { ModelCatalog } from '../components/marketplace/ModelCatalog.js';
import { MarketStatsRibbon } from '../components/marketplace/MarketStatsRibbon.js';
import { MarketPriceLadder } from '../components/marketplace/MarketPriceLadder.js';
import { MarketVolumePanel } from '../components/marketplace/MarketVolumePanel.js';
import { FeaturedModels } from '../components/marketplace/FeaturedModels.js';
import { PageHero } from '../components/system/PageHero.js';
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

  return (
    <section className="beta-page market-page">
      <PageHero
        compact
        eyebrow="open market"
        lede="Live order books and USDC settlement."
        title="Discount verified inference."
      />

      <details className="market-page__quickstart">
        <summary>API quickstart</summary>
        <CurlQuickstart
          code={buildInferenceCurlSnippet({
            apiBase: API_BASE,
            model: visibleMarkets[0]?.modelId ?? 'gpt-5.5',
            prompt: 'Run on the cheapest verified seller.',
            maxBudgetUsd: 1,
            privacyMode: 'prefer',
            relativePath: true,
          })}
          compact
          runHref={`/playground?model=${encodeURIComponent(visibleMarkets[0]?.modelId ?? 'gpt-5.5')}`}
          theme="raid"
        />
      </details>

      <ApiReadinessBanner error={markets.error} label="Marketplace unavailable" />
      <MarketStatsRibbon isLoading={markets.isLoading} markets={markets.data} />
      <FeaturedModels
        activeModelId={filters.model.trim() || undefined}
        markets={allMarkets.data?.data ?? visibleMarkets}
        onOpenModel={onOpenModel}
        onSelectModel={(modelId) =>
          setFilters({
            ...filters,
            model: filters.model.trim() === modelId ? '' : modelId,
          })
        }
      />
      <MarketSavingsSummary
        activeOffers={markets.data?.stats.activeOffers}
        markets={trustFilteredMarkets}
      />

      <div className="market-page__charts">
        <MarketDiscountChart markets={trustFilteredMarkets} />
        <MarketPriceLadder markets={trustFilteredMarkets} />
        <MarketVolumePanel stats={markets.data?.stats} />
      </div>

      <div className="marketplace-layout market-page__layout">
        <aside className="beta-panel beta-panel--filters">
          <p className="eyebrow">filters</p>
          <FilterField
            label="model"
            onChange={(value) => setFilters({ ...filters, model: value })}
            placeholder="gpt-5.5"
            value={filters.model}
          />
          <FilterField
            label="provider"
            onChange={(value) => setFilters({ ...filters, provider: value })}
            placeholder="openai"
            value={filters.provider}
          />
          <FilterSelect
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
          <FilterSelect
            label="trust"
            onChange={(value) => setFilters({ ...filters, trust: value as MarketplaceTrustFilter })}
            options={[
              ['any', 'any'],
              ['tee', 'tee attested'],
              ['e2ee', 'e2ee'],
              ['private', 'private signals'],
            ]}
            value={filters.trust}
          />
          <details className="market-page__filters-advanced">
            <summary>advanced</summary>
            <FilterSelect
              label="privacy"
              onChange={(value) => setFilters({ ...filters, privacy: value })}
              options={[
                ['any', 'any'],
                ['strict', 'strict private'],
              ]}
              value={filters.privacy}
            />
            <FilterSelect
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
          </details>
          <FilterField
            inputMode="decimal"
            label="max budget"
            onChange={(value) => setFilters({ ...filters, budget: value })}
            placeholder="1.00"
            value={filters.budget}
          />

          {markets.data?.custody ? (
            <p className="quiet-note">{markets.data.custody.sellerCredentialPolicy}</p>
          ) : null}
        </aside>

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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: 'decimal' | 'text';
}) {
  return (
    <label className="field">
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

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue || 'any'} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="eyebrow">{title}</p>
      <p>{body}</p>
      {action}
    </div>
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
