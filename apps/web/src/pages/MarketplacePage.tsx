import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { API_BASE, fetchMarkets } from '../api';
import { ModelCatalog } from '../components/marketplace/ModelCatalog.js';
import { MarketStatsRibbon } from '../components/marketplace/MarketStatsRibbon.js';
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
  const markets = useSWR(
    ['markets', params.toString()],
    () => fetchMarkets(Object.fromEntries(params.entries())),
    { refreshInterval: 15_000 }
  );
  const visibleMarkets = markets.data?.data ?? [];

  return (
    <section className="beta-page market-page">
      <header className="beta-hero beta-hero--compact market-page__hero">
        <div>
          <p className="eyebrow">open market for models</p>
          <h1>Buy discounted verified inference.</h1>
          <p className="lede">
            Browse live seller order books by model, compare rates against static benchmark
            references, and route OpenAI-compatible calls through the cheapest eligible seller.
            Settlement stays in USDC; seller credentials stay hidden.
          </p>
        </div>
        <QuickstartCard marketModelId={visibleMarkets[0]?.modelId} />
      </header>

      <MarketStatsRibbon markets={markets.data} />

      <div className="market-page__volume-row">
        <MarketVolumePanel stats={markets.data?.stats} />
      </div>

      <div className="marketplace-layout market-page__layout">
        <aside className="beta-panel beta-panel--filters">
          <p className="eyebrow">filters</p>
          <FilterField
            label="model id"
            onChange={(value) => setFilters({ ...filters, model: value })}
            placeholder="gpt-5.5"
            value={filters.model}
          />
          <FilterField
            label="model provider"
            onChange={(value) => setFilters({ ...filters, provider: value })}
            placeholder="openai"
            value={filters.provider}
          />
          <FilterSelect
            label="agent framework"
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
            label="privacy"
            onChange={(value) => setFilters({ ...filters, privacy: value })}
            options={[
              ['any', 'any'],
              ['strict', 'strict private'],
            ]}
            value={filters.privacy}
          />
          <FilterSelect
            label="verification"
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
            inputMode="decimal"
            label="max budget"
            onChange={(value) => setFilters({ ...filters, budget: value })}
            placeholder="1.00"
            value={filters.budget}
          />

          {markets.data?.custody ? (
            <div className="market-page__policy">
              <p className="eyebrow">custody</p>
              <p>{markets.data.custody.sellerCredentialPolicy}</p>
            </div>
          ) : null}
        </aside>

        <div className="market-page__main">
          {markets.error ? (
            <EmptyState
              body="The API did not return market data. Check API origin and readiness."
              title="Marketplace unavailable"
            />
          ) : markets.isLoading ? (
            <EmptyState body="Reading verified seller order books." title="Loading markets" />
          ) : visibleMarkets.length === 0 ? (
            <EmptyState
              body="No seller currently matches this model, budget, verification, and privacy filter."
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
  const code = `curl -X POST ${API_BASE}/v1/inference/chat/completions \\
  -H "authorization: Bearer br_..." \\
  -H "content-type: application/json" \\
  -d '{"model":"${model}","messages":[{"role":"user","content":"Run on the cheapest verified seller."}],"raid_policy":{"max_total_cost":1,"privacy_mode":"prefer"}}'`;

  return (
    <aside className="quickstart-card">
      <p className="eyebrow">buyer quickstart</p>
      <pre className="code-panel">{code}</pre>
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

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <p className="eyebrow">{title}</p>
      <p>{body}</p>
    </div>
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
