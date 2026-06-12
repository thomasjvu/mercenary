import { useMemo, useState } from 'react';
import type { InferenceMarket } from '../../api/marketplace.js';
import {
  computeSavingsPercent,
  computeSavingsUsd,
  estimateBenchmarkTaskUsd,
} from '../../lib/marketplace-benchmark.js';
import { formatUsd } from '@bossraid/proof-ui';
import { formatLatency, formatPercent, formatSavingsLabel } from '../../lib/marketplace-format.js';
import { ProviderBrandIcon } from '../ProviderBrandIcon.js';

export type ModelSortKey = 'price' | 'sellers' | 'success' | 'latency' | 'model';

type ModelCatalogProps = {
  markets: InferenceMarket[];
  onOpenModel: (modelId: string) => void;
};

export function ModelCatalog({ markets, onOpenModel }: ModelCatalogProps) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<ModelSortKey>('price');

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const rows = markets.filter((market) => {
      if (!normalizedQuery) {
        return true;
      }

      return (
        market.modelId.toLowerCase().includes(normalizedQuery) ||
        market.modelProvider?.toLowerCase().includes(normalizedQuery) === true
      );
    });

    return rows.sort((left, right) => compareMarkets(left, right, sortKey));
  }, [markets, query, sortKey]);

  return (
    <div className="model-catalog">
      <div className="model-catalog__toolbar">
        <label className="field field--inline">
          <span>search models</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="gpt-5.5, claude, gemma..."
            value={query}
          />
        </label>
        <label className="field field--inline">
          <span>sort</span>
          <select
            onChange={(event) => setSortKey(event.target.value as ModelSortKey)}
            value={sortKey}
          >
            <option value="price">cheapest first</option>
            <option value="sellers">most sellers</option>
            <option value="success">success rate</option>
            <option value="latency">p50 latency</option>
            <option value="model">model id</option>
          </select>
        </label>
        <p className="model-catalog__count">{filtered.length} models</p>
      </div>

      <div className="model-catalog__table-wrap">
        <table className="model-catalog__table">
          <thead>
            <tr>
              <th>model</th>
              <th>from</th>
              <th>savings</th>
              <th>sellers</th>
              <th>success</th>
              <th>p50</th>
              <th>unit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((market) => (
              <ModelRow
                key={market.modelId}
                market={market}
                onOpen={() => onOpenModel(market.modelId)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ModelRow({ market, onOpen }: { market: InferenceMarket; onOpen: () => void }) {
  const benchmark = estimateBenchmarkTaskUsd(market.modelId);
  const savingsUsd = computeSavingsUsd(benchmark, market.cheapestRateUsd);
  const savingsPercent = computeSavingsPercent(benchmark, market.cheapestRateUsd);
  const savingsLabel = formatSavingsLabel(savingsUsd, savingsPercent);

  return (
    <tr>
      <td>
        <button className="model-catalog__model-button" onClick={onOpen} type="button">
          <ProviderBrandIcon modelProvider={market.modelProvider} />
          <span className="model-catalog__model-copy">
            <strong>{market.modelId}</strong>
            <span>{market.modelProvider ?? 'mixed'}</span>
          </span>
        </button>
      </td>
      <td>{formatUsd(market.cheapestRateUsd)}</td>
      <td>
        <div className="model-catalog__savings">
          <span>{savingsLabel ?? '—'}</span>
          {savingsPercent != null && savingsPercent > 0 ? (
            <div className="model-catalog__savings-bar" aria-hidden="true">
              <span
                className="model-catalog__savings-fill"
                style={{ width: `${Math.min(100, savingsPercent)}%` }}
              />
            </div>
          ) : null}
        </div>
      </td>
      <td>
        {market.activeProviderCount}/{market.providerCount}
      </td>
      <td>{formatPercent(market.recentSuccessRate)}</td>
      <td>{formatLatency(market.p50LatencyMs)}</td>
      <td>{market.pricing.declaredUnit}</td>
    </tr>
  );
}

function compareMarkets(left: InferenceMarket, right: InferenceMarket, sortKey: ModelSortKey) {
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
