import { useMemo } from 'react';
import type { InferenceMarket } from '../../api/marketplace.js';
import {
  computeSavingsPercent,
  computeSavingsUsd,
  resolveMarketBenchmarkTaskUsd,
} from '../../lib/marketplace-benchmark.js';
import { formatUsd } from '@bossraid/proof-ui';
import { formatLatency, formatPercent, formatSavingsLabel } from '../../lib/marketplace-format.js';
import {
  formatPer1mTokenPrice,
  resolveMarketBaseInputPer1mUsd,
  resolveMarketBaseOutputPer1mUsd,
} from '../../lib/marketplace-pricing.js';
import type { MarketplaceSortKey } from '../../lib/marketplace-filters.js';
import { ProviderBrandIcon } from '../ProviderBrandIcon.js';
import { SegmentBar } from '../system/SegmentBar.js';

type ModelCatalogProps = {
  markets: InferenceMarket[];
  sortKey: MarketplaceSortKey;
  onOpenModel: (modelId: string) => void;
};

export function ModelCatalog({ markets, sortKey, onOpenModel }: ModelCatalogProps) {
  const sorted = useMemo(
    () => [...markets].sort((left, right) => compareMarkets(left, right, sortKey)),
    [markets, sortKey]
  );

  return (
    <div className="model-catalog model-catalog--cards">
      <p className="model-catalog__count">{sorted.length} models</p>

      <div className="model-catalog__table-wrap">
        <table className="model-catalog__table">
          <thead>
            <tr>
              <th>model</th>
              <th title="Reference input price per 1M tokens (models.dev)">base in</th>
              <th title="Reference output price per 1M tokens (models.dev)">base out</th>
              <th>from</th>
              <th>savings</th>
              <th>sellers</th>
              <th>success</th>
              <th>p50</th>
              <th>tee</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((market) => (
              <ModelRow
                key={market.modelId}
                market={market}
                onOpen={() => onOpenModel(market.modelId)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="model-catalog__cards">
        {sorted.map((market) => (
          <ModelCard
            key={market.modelId}
            market={market}
            onOpen={() => onOpenModel(market.modelId)}
          />
        ))}
      </div>
    </div>
  );
}

function useMarketPresentation(market: InferenceMarket) {
  const benchmark = resolveMarketBenchmarkTaskUsd(market);
  const teeSellerCount = market.sellers.filter((seller) => seller.privacy.teeAttested).length;
  const savingsUsd = computeSavingsUsd(benchmark, market.cheapestRateUsd);
  const savingsPercent = computeSavingsPercent(benchmark, market.cheapestRateUsd);
  const savingsLabel = formatSavingsLabel(savingsUsd, savingsPercent);

  return {
    benchmark,
    teeSellerCount,
    savingsPercent,
    savingsLabel,
  };
}

function ModelRow({ market, onOpen }: { market: InferenceMarket; onOpen: () => void }) {
  const { teeSellerCount, savingsPercent, savingsLabel } = useMarketPresentation(market);
  const baseInputPer1mUsd = resolveMarketBaseInputPer1mUsd(market);
  const baseOutputPer1mUsd = resolveMarketBaseOutputPer1mUsd(market);

  return (
    <tr>
      <td>
        <button className="model-catalog__model-button" onClick={onOpen} type="button">
          <ProviderBrandIcon modelProvider={market.modelProvider} />
          <span className="model-catalog__model-copy">
            <strong>{market.modelId}</strong>
            <span>
              {market.modelProvider ?? 'mixed'}
              {market.activeProviderCount === 0 ? ' · catalog only' : ''}
            </span>
          </span>
        </button>
      </td>
      <td>{formatPer1mTokenPrice(baseInputPer1mUsd)}</td>
      <td>{formatPer1mTokenPrice(baseOutputPer1mUsd)}</td>
      <td>{formatUsd(market.cheapestRateUsd)}</td>
      <td>
        <div className="model-catalog__savings">
          <span>{savingsLabel ?? '—'}</span>
          {savingsPercent != null && savingsPercent > 0 ? (
            <SegmentBar segments={20} tone="savings" value={Math.min(100, savingsPercent)} />
          ) : null}
        </div>
      </td>
      <td>
        {market.activeProviderCount}/{market.providerCount}
      </td>
      <td>{formatPercent(market.recentSuccessRate)}</td>
      <td>{formatLatency(market.p50LatencyMs)}</td>
      <td>
        {teeSellerCount > 0 ? (
          <span className="trust-badge trust-badge--tee">{teeSellerCount} tee</span>
        ) : (
          '—'
        )}
      </td>
    </tr>
  );
}

function ModelCard({ market, onOpen }: { market: InferenceMarket; onOpen: () => void }) {
  const { teeSellerCount, savingsPercent, savingsLabel } = useMarketPresentation(market);
  const baseInputPer1mUsd = resolveMarketBaseInputPer1mUsd(market);
  const baseOutputPer1mUsd = resolveMarketBaseOutputPer1mUsd(market);

  return (
    <article className="model-catalog__card">
      <button className="model-catalog__model-button" onClick={onOpen} type="button">
        <ProviderBrandIcon modelProvider={market.modelProvider} />
        <span className="model-catalog__model-copy">
          <strong>{market.modelId}</strong>
          <span>
            {market.modelProvider ?? 'mixed'}
            {market.activeProviderCount === 0 ? ' · catalog only' : ''}
          </span>
        </span>
      </button>

      <dl className="model-catalog__card-stats">
        <div>
          <dt>base in</dt>
          <dd>{formatPer1mTokenPrice(baseInputPer1mUsd)}</dd>
        </div>
        <div>
          <dt>base out</dt>
          <dd>{formatPer1mTokenPrice(baseOutputPer1mUsd)}</dd>
        </div>
        <div>
          <dt>from</dt>
          <dd>{formatUsd(market.cheapestRateUsd)}</dd>
        </div>
        <div>
          <dt>savings</dt>
          <dd>{savingsLabel ?? '—'}</dd>
        </div>
        <div>
          <dt>sellers</dt>
          <dd>
            {market.activeProviderCount}/{market.providerCount}
          </dd>
        </div>
        <div>
          <dt>success</dt>
          <dd>{formatPercent(market.recentSuccessRate)}</dd>
        </div>
        <div>
          <dt>p50</dt>
          <dd>{formatLatency(market.p50LatencyMs)}</dd>
        </div>
        <div>
          <dt>tee</dt>
          <dd>
            {teeSellerCount > 0 ? (
              <span className="trust-badge trust-badge--tee">{teeSellerCount} tee</span>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>

      {savingsPercent != null && savingsPercent > 0 ? (
        <SegmentBar segments={24} tone="savings" value={Math.min(100, savingsPercent)} />
      ) : null}
    </article>
  );
}

function compareMarkets(
  left: InferenceMarket,
  right: InferenceMarket,
  sortKey: MarketplaceSortKey
) {
  switch (sortKey) {
    case 'sellers':
      return (
        right.activeProviderCount - left.activeProviderCount ||
        left.modelId.localeCompare(right.modelId)
      );
    case 'success':
      return (
        (right.recentSuccessRate ?? -1) - (left.recentSuccessRate ?? -1) ||
        left.modelId.localeCompare(right.modelId)
      );
    case 'latency':
      return (
        (left.p50LatencyMs ?? Number.POSITIVE_INFINITY) -
          (right.p50LatencyMs ?? Number.POSITIVE_INFINITY) ||
        left.modelId.localeCompare(right.modelId)
      );
    case 'model':
      return left.modelId.localeCompare(right.modelId);
    case 'price':
    default:
      return (
        (left.cheapestRateUsd ?? Number.POSITIVE_INFINITY) -
          (right.cheapestRateUsd ?? Number.POSITIVE_INFINITY) ||
        left.modelId.localeCompare(right.modelId)
      );
  }
}
