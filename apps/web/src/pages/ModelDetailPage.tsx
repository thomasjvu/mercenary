import useSWR from 'swr';
import { fetchMarkets, type ProviderHealth } from '../api';
import {
  ModelDiscountBar,
  SellerPriceSpreadChart,
} from '../components/marketplace/MarketDiscountChart.js';
import { AccentBlock } from '../components/system/AccentBlock.js';
import { UpstreamTeeVerificationPanel } from '../components/trust/UpstreamTeeVerificationPanel.js';
import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import { isUpstreamProviderId } from '@bossraid/constants';
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
      <header className="model-detail-page__hero">
        <div className="model-detail-page__intro">
          <button className="model-detail-page__back" onClick={onBack} type="button">
            ← all models
          </button>
          <div className="model-detail-page__identity">
            <p className="eyebrow model-detail-page__provider">
              <ProviderBrandIcon modelProvider={market?.modelProvider} size={16} />
              {market?.modelProvider ?? 'model marketplace'}
            </p>
            <h1>{modelId}</h1>
          </div>
        </div>

        {market ? (
          <div className="model-detail-page__cta">
            <AccentBlock className="model-detail-page__quote" tone="red">
              <p className="model-detail-page__price">from {formatUsd(market.cheapestRateUsd)}</p>
              {savingsLabel ? <p className="model-detail-page__savings">{savingsLabel}</p> : null}
            </AccentBlock>
            <button
              className="button button--primary info-panel__cta rx-spacebar-clip"
              onClick={() => onTryModel(modelId)}
              type="button"
            >
              try in playground
            </button>
          </div>
        ) : null}
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
          <div aria-label="Model statistics" className="model-detail-page__stats">
            <DetailStat
              label="sellers"
              value={`${market.activeProviderCount}/${market.providerCount}`}
            />
            <DetailStat label="verified" value={String(market.verifiedSellerCount)} />
            <DetailStat label="tee" value={String(teeSellerCount)} />
            <DetailStat label="private" value={String(market.privateSellerCount)} />
            <DetailStat label="success" value={formatPercent(market.recentSuccessRate)} />
            <DetailStat label="p50" value={formatLatency(market.p50LatencyMs)} />
            <DetailStat label="p95" value={formatLatency(market.p95LatencyMs)} />
            <DetailStat label="unit" value={market.pricing.declaredUnit} />
            <DetailStat
              label="in / 1M"
              value={formatUsd(market.pricing.pricePer1mInputTokensUsd, 3)}
            />
          </div>

          <div className="model-detail-page__body">
            <SellerOrderBook
              compact
              healthBySellerId={healthBySellerId}
              market={market}
              showClose={false}
            />

            <aside className="model-detail-page__aside">
              <ModelDiscountBar market={market} />
              <SellerPriceSpreadChart market={market} />

              {catalogEntry?.teeAttested || catalogEntry?.e2ee ? (
                <AccentBlock className="model-detail-page__tee" tone="blue">
                  <p className="eyebrow">tee verification</p>
                  <UpstreamTeeVerificationPanel
                    e2ee={catalogEntry.e2ee}
                    modelId={modelId}
                    provider={attestationProvider}
                    teeAttested={catalogEntry.teeAttested}
                  />
                </AccentBlock>
              ) : null}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="model-detail-page__stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
