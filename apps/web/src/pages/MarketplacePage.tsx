import { useMemo, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { API_BASE, fetchMarkets } from '../api';
import { ApiReadinessBanner } from '../components/system/ApiReadinessBanner.js';
import { buildApiReadinessHint, readApiErrorMessage } from '../lib/api-readiness.js';
import { MarketDiscountChart } from '../components/marketplace/MarketDiscountChart.js';
import { MarketSavingsSummary } from '../components/marketplace/MarketSavingsSummary.js';
import { ModelCatalog } from '../components/marketplace/ModelCatalog.js';
import { MarketStatsRibbon } from '../components/marketplace/MarketStatsRibbon.js';
import { MarketPriceLadder } from '../components/marketplace/MarketPriceLadder.js';
import { MarketVolumePanel } from '../components/marketplace/MarketVolumePanel.js';

const FILTER_DEFAULTS = {
  model: '',
  provider: '',
  framework: '',
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
  const unfilteredMarkets = useSWR(
    filtersActive ? ['markets', 'unfiltered'] : null,
    () => fetchMarkets(),
    { refreshInterval: 15_000 }
  );
  const visibleMarkets = markets.data?.data ?? [];
  const totalMarketCount = unfilteredMarkets.data?.data.length ?? 0;

  return (
    <section className="beta-page market-page">
      <header className="beta-hero beta-hero--compact market-page__hero">
        <div>
          <p className="eyebrow">open market for models</p>
          <h1>Discount verified inference.</h1>
          <p className="lede">Live order books, benchmark savings, USDC settlement.</p>
        </div>
        <QuickstartCard marketModelId={visibleMarkets[0]?.modelId} />
      </header>

      <ApiReadinessBanner error={markets.error} label="Marketplace unavailable" />
      <MarketStatsRibbon isLoading={markets.isLoading} markets={markets.data} variant="quest" />
      <MarketSavingsSummary
        activeOffers={markets.data?.stats.activeOffers}
        markets={visibleMarkets}
      />

      <div className="market-page__charts">
        <MarketDiscountChart markets={visibleMarkets} />
        <MarketPriceLadder markets={visibleMarkets} />
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
          ) : visibleMarkets.length === 0 ? (
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
            <ModelCatalog markets={visibleMarkets} onOpenModel={onOpenModel} />
          )}
        </div>
      </div>
    </section>
  );
}

function QuickstartCard({ marketModelId }: { marketModelId?: string }) {
  const model = marketModelId ?? 'gpt-5.5';
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const code = `curl -X POST ${API_BASE}/v1/inference/chat/completions \\
  -H "authorization: Bearer br_..." \\
  -H "content-type: application/json" \\
  -d '{"model":"${model}","messages":[{"role":"user","content":"Run on the cheapest verified seller."}],"raid_policy":{"max_total_cost":1,"privacy_mode":"prefer"}}'`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  return (
    <aside className="quickstart-card">
      <p className="eyebrow">buyer quickstart</p>
      <div className="quickstart-card__actions">
        <button className="button button--primary" onClick={() => void handleCopy()} type="button">
          {copied ? 'copied' : 'copy curl'}
        </button>
        <button className="button" onClick={() => setExpanded((current) => !current)} type="button">
          {expanded ? 'hide' : 'show curl'}
        </button>
      </div>
      {expanded ? <pre className="code-panel">{code}</pre> : null}
    </aside>
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
