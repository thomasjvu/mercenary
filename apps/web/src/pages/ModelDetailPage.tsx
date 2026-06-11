import useSWR from 'swr';
import { API_BASE, fetchMarkets, type ProviderHealth } from '../api';
import { InferencePlayground } from '../components/marketplace/InferencePlayground.js';
import { MarketStatsRibbon } from '../components/marketplace/MarketStatsRibbon.js';
import { MarketVolumePanel } from '../components/marketplace/MarketVolumePanel.js';
import { SellerOrderBook } from '../components/marketplace/SellerOrderBook.js';
import {
  computeSavingsPercent,
  computeSavingsUsd,
  estimateBenchmarkTaskUsd,
} from '../lib/marketplace-benchmark.js';
import { formatUsd } from '@bossraid/proof-ui';
import { formatLatency, formatPercent, formatSavingsLabel } from '../lib/marketplace-format.js';

type ModelDetailPageProps = {
  modelId: string;
  providerHealth: ProviderHealth[];
  onBack: () => void;
  onTryModel: (modelId: string) => void;
};

export function ModelDetailPage({
  modelId,
  providerHealth,
  onBack,
  onTryModel,
}: ModelDetailPageProps) {
  const markets = useSWR(['market-detail', modelId], () => fetchMarkets({ model_id: modelId }));
  const market = markets.data?.data[0];
  const healthBySellerId = new Map(providerHealth.map((entry) => [entry.providerId, entry]));
  const benchmark = estimateBenchmarkTaskUsd(modelId);
  const savingsUsd = computeSavingsUsd(benchmark, market?.cheapestRateUsd);
  const savingsPercent = computeSavingsPercent(benchmark, market?.cheapestRateUsd);
  const savingsLabel = formatSavingsLabel(savingsUsd, savingsPercent);

  const curlSnippet = `curl -X POST ${API_BASE}/v1/inference/chat/completions \\
  -H "authorization: Bearer br_..." \\
  -H "content-type: application/json" \\
  -d '{"model":"${modelId}","messages":[{"role":"user","content":"Hello from Boss Raid"}],"raid_policy":{"max_total_cost":1,"privacy_mode":"prefer"}}'`;

  return (
    <section className="beta-page model-detail-page">
      <header className="beta-hero beta-hero--compact">
        <div>
          <button className="button model-detail-page__back" onClick={onBack} type="button">
            ← all models
          </button>
          <p className="eyebrow">{market?.modelProvider ?? 'model marketplace'}</p>
          <h1>{modelId}</h1>
          <p className="lede">
            Full seller order book for this model with live health, benchmark savings, token/task
            pricing, and a built-in try panel.
          </p>
        </div>
        <aside className="quickstart-card">
          <p className="eyebrow">from</p>
          <strong className="model-detail-page__price">{formatUsd(market?.cheapestRateUsd)}</strong>
          {savingsLabel ? <p className="model-detail-page__savings">{savingsLabel}</p> : null}
          <button
            className="button button--primary"
            onClick={() => onTryModel(modelId)}
            type="button"
          >
            try in playground
          </button>
        </aside>
      </header>

      {markets.error ? (
        <div className="empty-state">
          <p className="eyebrow">unavailable</p>
          <p>Could not load market data for {modelId}.</p>
        </div>
      ) : markets.isLoading ? (
        <div className="empty-state">
          <p className="eyebrow">loading</p>
          <p>Reading seller order book...</p>
        </div>
      ) : !market ? (
        <div className="empty-state">
          <p className="eyebrow">no sellers</p>
          <p>No eligible sellers are registered for {modelId}.</p>
        </div>
      ) : (
        <>
          <MarketStatsRibbon markets={markets.data} />

          <div className="model-detail-page__grid">
            <article className="beta-panel">
              <p className="eyebrow">model stats</p>
              <div className="metric-grid">
                <Metric
                  label="sellers"
                  value={`${market.activeProviderCount}/${market.providerCount}`}
                />
                <Metric label="verified" value={String(market.verifiedSellerCount)} />
                <Metric label="private" value={String(market.privateSellerCount)} />
                <Metric label="success" value={formatPercent(market.recentSuccessRate)} />
                <Metric label="p50" value={formatLatency(market.p50LatencyMs)} />
                <Metric label="p95" value={formatLatency(market.p95LatencyMs)} />
                <Metric label="unit" value={market.pricing.declaredUnit} />
                <Metric
                  label="token in / 1M"
                  value={formatUsd(market.pricing.pricePer1mInputTokensUsd, 3)}
                />
              </div>
              {markets.data?.settlement ? (
                <p className="quiet-note">
                  Settlement: {markets.data.settlement.asset} on {markets.data.settlement.network}
                </p>
              ) : null}
            </article>

            <MarketVolumePanel stats={markets.data?.stats} />
          </div>

          <SellerOrderBook
            healthBySellerId={healthBySellerId}
            market={market}
            onTry={() => onTryModel(modelId)}
            showClose={false}
          />

          <div className="model-detail-page__split">
            <aside className="beta-panel">
              <p className="eyebrow">production curl</p>
              <pre className="code-panel">{curlSnippet}</pre>
            </aside>
            <InferencePlayground initialModelId={modelId} />
          </div>
        </>
      )}
    </section>
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
