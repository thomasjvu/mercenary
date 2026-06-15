import useSWR from 'swr';
import { fetchMarkets, type ProviderHealth } from '../api';
import {
  ModelDiscountBar,
  SellerPriceSpreadChart,
} from '../components/marketplace/MarketDiscountChart.js';
import { PageHero } from '../components/system/PageHero.js';
import { UpstreamTeeVerificationPanel } from '../components/trust/UpstreamTeeVerificationPanel.js';
import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import { isUpstreamProviderId } from '@bossraid/constants';
import { MarketStatsRibbon } from '../components/marketplace/MarketStatsRibbon.js';
import { SellerOrderBook } from '../components/marketplace/SellerOrderBook.js';
import { ProviderBrandIcon } from '../components/ProviderBrandIcon.js';
import {
  computeSavingsPercent,
  computeSavingsUsd,
  resolveMarketBenchmarkTaskUsd,
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
  const benchmark = market ? resolveMarketBenchmarkTaskUsd(market) : undefined;
  const catalogEntry = INFERENCE_MODEL_CATALOG.find((entry) => entry.modelId === modelId);
  const attestationProvider =
    catalogEntry?.attestationVendor && isUpstreamProviderId(catalogEntry.attestationVendor)
      ? catalogEntry.attestationVendor
      : catalogEntry?.modelProvider && isUpstreamProviderId(catalogEntry.modelProvider)
        ? catalogEntry.modelProvider
        : 'venice';
  const teeSellerCount = market?.sellers.filter((seller) => seller.privacy.teeAttested).length ?? 0;
  const savingsUsd = computeSavingsUsd(benchmark, market?.cheapestRateUsd);
  const savingsPercent = computeSavingsPercent(benchmark, market?.cheapestRateUsd);
  const savingsLabel = formatSavingsLabel(savingsUsd, savingsPercent);

  return (
    <section className="beta-page model-detail-page">
      <PageHero
        actions={
          <button className="button model-detail-page__back" onClick={onBack} type="button">
            ← all models
          </button>
        }
        aside={
          <div className="quickstart-card">
            <p className="eyebrow">from {formatUsd(market?.cheapestRateUsd)}</p>
            {savingsLabel ? <p className="model-detail-page__savings">{savingsLabel}</p> : null}
            <button
              className="button button--primary"
              onClick={() => onTryModel(modelId)}
              type="button"
            >
              try in playground
            </button>
          </div>
        }
        compact
        eyebrow={
          <>
            <ProviderBrandIcon modelProvider={market?.modelProvider} size={16} />{' '}
            {market?.modelProvider ?? 'model marketplace'}
          </>
        }
        title={modelId}
      />

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
                <Metric label="tee verified" value={String(teeSellerCount)} />
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
            </article>

            <div className="market-page__charts market-page__charts--single">
              <ModelDiscountBar market={market} />
              <SellerPriceSpreadChart market={market} />
            </div>
          </div>

          {catalogEntry?.teeAttested || catalogEntry?.e2ee ? (
            <article className="beta-panel model-detail-page__tee">
              <p className="eyebrow">tee verification</p>
              <UpstreamTeeVerificationPanel
                e2ee={catalogEntry.e2ee}
                modelId={modelId}
                provider={attestationProvider}
                teeAttested={catalogEntry.teeAttested}
              />
            </article>
          ) : null}

          <SellerOrderBook
            healthBySellerId={healthBySellerId}
            market={market}
            onTry={() => onTryModel(modelId)}
            showClose={false}
          />
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
