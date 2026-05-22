import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { API_BASE, fetchMarkets, type InferenceMarket } from '../api';

const FILTER_DEFAULTS = {
  model: '',
  provider: '',
  framework: '',
  privacy: 'any',
  verification: 'any',
  budget: '',
};

type MarketplaceFilters = typeof FILTER_DEFAULTS;

export function MarketplacePage() {
  const [filters, setFilters] = useState<MarketplaceFilters>(FILTER_DEFAULTS);
  const params = useMemo(() => buildMarketParams(filters), [filters]);
  const markets = useSWR(['markets', params.toString()], () =>
    fetchMarkets(Object.fromEntries(params.entries()))
  );
  const visibleMarkets = markets.data?.data ?? [];

  return (
    <section className="beta-page">
      <header className="beta-hero beta-hero--compact">
        <div>
          <p className="eyebrow">marketplace</p>
          <h1>Buy cheap verified inference.</h1>
          <p className="lede">
            Route OpenAI-compatible chat calls to verified sellers by model, provider, framework,
            privacy mode, and max budget. Settlement stays in USDC; seller credentials stay hidden.
          </p>
        </div>
        <QuickstartCard market={visibleMarkets[0]} />
      </header>

      <div className="marketplace-layout">
        <aside className="beta-panel beta-panel--filters">
          <label className="field">
            <span>model id</span>
            <input
              onChange={(event) => setFilters({ ...filters, model: event.target.value })}
              placeholder="gpt-5.5"
              value={filters.model}
            />
          </label>
          <label className="field">
            <span>model provider</span>
            <input
              onChange={(event) => setFilters({ ...filters, provider: event.target.value })}
              placeholder="openai"
              value={filters.provider}
            />
          </label>
          <label className="field">
            <span>agent framework</span>
            <select
              onChange={(event) => setFilters({ ...filters, framework: event.target.value })}
              value={filters.framework}
            >
              <option value="">any</option>
              <option value="codex">codex</option>
              <option value="claude_code">claude code</option>
              <option value="openclaw">openclaw</option>
              <option value="custom">custom</option>
            </select>
          </label>
          <label className="field">
            <span>privacy</span>
            <select
              onChange={(event) => setFilters({ ...filters, privacy: event.target.value })}
              value={filters.privacy}
            >
              <option value="any">any</option>
              <option value="strict">strict private</option>
            </select>
          </label>
          <label className="field">
            <span>verification</span>
            <select
              onChange={(event) => setFilters({ ...filters, verification: event.target.value })}
              value={filters.verification}
            >
              <option value="any">any</option>
              <option value="verified">verified</option>
              <option value="pending">pending</option>
              <option value="failed">failed</option>
            </select>
          </label>
          <label className="field">
            <span>max budget</span>
            <input
              inputMode="decimal"
              onChange={(event) => setFilters({ ...filters, budget: event.target.value })}
              placeholder="1.00"
              value={filters.budget}
            />
          </label>
        </aside>

        <div className="market-list">
          {markets.error ? (
            <EmptyState
              title="Marketplace unavailable"
              body="The API did not return market data. Check API origin and readiness."
            />
          ) : markets.isLoading ? (
            <EmptyState title="Loading markets" body="Reading verified seller order books." />
          ) : visibleMarkets.length === 0 ? (
            <EmptyState
              title="No eligible sellers"
              body="No seller currently matches this model, budget, verification, and privacy filter."
            />
          ) : (
            visibleMarkets.map((market) => <MarketCard key={market.modelId} market={market} />)
          )}
        </div>
      </div>
    </section>
  );
}

function MarketCard({ market }: { market: InferenceMarket }) {
  const topSeller = market.sellers[0];
  return (
    <article className="market-card">
      <div className="market-card__header">
        <div>
          <p className="eyebrow">{market.modelProvider ?? 'mixed providers'}</p>
          <h2>{market.modelId}</h2>
        </div>
        <strong>{formatUsd(market.cheapestRateUsd)}</strong>
      </div>
      <div className="metric-grid">
        <Metric label="active" value={String(market.activeProviderCount)} />
        <Metric label="verified" value={String(market.verifiedSellerCount)} />
        <Metric label="private" value={String(market.privateSellerCount)} />
        <Metric label="success" value={formatPercent(market.recentSuccessRate)} />
        <Metric label="p50" value={formatLatency(market.p50LatencyMs)} />
        <Metric label="p95" value={formatLatency(market.p95LatencyMs)} />
      </div>
      <div className="seller-strip">
        {market.sellers.slice(0, 4).map((seller) => (
          <span key={seller.sellerId}>
            {seller.displayName} · {formatUsd(seller.rateUsd)} ·{' '}
            {seller.verificationStatus ?? 'pending'}
          </span>
        ))}
      </div>
      {topSeller ? (
        <p className="market-card__note">
          Cheapest seller is {topSeller.displayName}. Strict-private routing requires attested
          privacy metadata before matching.
        </p>
      ) : (
        <p className="market-card__note">Provider offline. New calls should expect no seller.</p>
      )}
    </article>
  );
}

function QuickstartCard({ market }: { market?: InferenceMarket }) {
  const model = market?.modelId ?? 'gpt-5.5';
  const code = `curl -X POST ${API_BASE}/v1/inference/chat/completions \\
  -H "authorization: Bearer br_..." \\
  -H "content-type: application/json" \\
  -d '{"model":"${model}","messages":[{"role":"user","content":"Run this on the cheapest verified seller."}],"raid_policy":{"max_total_cost":1,"privacy_mode":"prefer"}}'`;

  return (
    <aside className="quickstart-card">
      <p className="eyebrow">buyer quickstart</p>
      <pre className="code-panel">{code}</pre>
    </aside>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="metric">
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
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

function formatUsd(value: number | null | undefined) {
  return typeof value === 'number' ? `$${value.toFixed(2)}` : 'n/a';
}

function formatPercent(value: number | null) {
  return typeof value === 'number' ? `${Math.round(value * 100)}%` : 'n/a';
}

function formatLatency(value: number | null) {
  return typeof value === 'number' ? `${Math.round(value)}ms` : 'n/a';
}
