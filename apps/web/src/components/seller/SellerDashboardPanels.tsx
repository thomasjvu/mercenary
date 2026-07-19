import useSWR from 'swr';
import { formatUsd } from '@bossraid/proof-ui';
import { fetchMarkets } from '../../api/marketplace.js';
import { fetchSellerEarnings, fetchSellerStats, type SellerEarnings } from '../../api/auth.js';
import { SegmentBar } from '../system/SegmentBar.js';
import { ProviderBrandIcon } from '../ProviderBrandIcon.js';
import {
  computeSavingsPercent,
  resolveMarketBenchmarkTaskUsd,
} from '../../lib/marketplace-benchmark.js';

type SellerEarningsPanelProps = {
  isAuthenticated: boolean;
};

function buildEarningsSeries(payouts: SellerEarnings['payouts']) {
  const buckets = new Map<string, number>();
  for (const payout of payouts) {
    const entry = payout as SellerEarnings['payouts'][number] & {
      grossUsd?: number;
      createdAt?: string;
    };
    const stamp = entry.settledAt ?? entry.createdAt ?? '';
    const day = stamp ? stamp.slice(0, 10) : 'pending';
    const amount = entry.grossUsd ?? entry.amountUsd ?? 0;
    buckets.set(day, (buckets.get(day) ?? 0) + amount);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(-8)
    .map(([label, amount]) => ({ label, amount }));
}

export function SellerEarningsPanel({ isAuthenticated }: SellerEarningsPanelProps) {
  const earnings = useSWR(isAuthenticated ? '/v1/seller/earnings' : null, fetchSellerEarnings);
  const stats = useSWR(isAuthenticated ? '/v1/seller/stats' : null, fetchSellerStats);
  const grossUsd = earnings.data?.grossUsd ?? 0;
  const earnings24hUsd =
    (earnings.data as { earnings24hUsd?: number } | undefined)?.earnings24hUsd ??
    stats.data?.earnings24hUsd ??
    0;
  const routedRequests24h = stats.data?.routedRequests24h ?? 0;
  const activeOffers = stats.data?.activeOffers ?? 0;
  const series = buildEarningsSeries(earnings.data?.payouts ?? []);
  const maxAmount = Math.max(...series.map((entry) => entry.amount), 0.0001);

  return (
    <article className="sell-panel sell-panel--earnings">
      <p className="sell-panel__eyebrow">earned</p>
      <div className="sell-earnings__amount-row">
        <strong className="sell-earnings__amount">{formatUsd(grossUsd)}</strong>
        {earnings24hUsd > 0 ? (
          <span className="sell-earnings__delta">+{formatUsd(earnings24hUsd)} last 24h</span>
        ) : (
          <span className="sell-earnings__delta sell-earnings__delta--muted">
            Earnings appear once an offer is live.
          </span>
        )}
      </div>

      <div aria-hidden="true" className="sell-earnings__chart">
        {series.length > 0 ? (
          series.map((entry) => (
            <div className="sell-earnings__chart-col" key={entry.label}>
              <span
                className="sell-earnings__chart-bar"
                style={{ height: `${Math.max(8, (entry.amount / maxAmount) * 100)}%` }}
              />
              <span className="sell-earnings__chart-label">{entry.label.slice(5)}</span>
            </div>
          ))
        ) : (
          <p className="quiet-note sell-earnings__chart-empty">
            Payout history will chart here. Cancelled or zero-success buyer jobs do not create
            seller credits.
          </p>
        )}
      </div>

      <div className="sell-earnings__stats">
        <div>
          <span>requests</span>
          <strong>{routedRequests24h.toLocaleString()}</strong>
        </div>
        <div>
          <span>active offers</span>
          <strong>{activeOffers}</strong>
        </div>
        <div>
          <span>payouts</span>
          <strong>{earnings.data?.payoutCount ?? 0}</strong>
        </div>
        <div>
          <span>providers</span>
          <strong>{stats.data?.providers.length ?? 0}</strong>
        </div>
      </div>
    </article>
  );
}

const LIVE_TAGS = ['hottest', 'discount', 'going quick'] as const;

export function SellerLiveMarketPanel() {
  const markets = useSWR('sell-dashboard-markets', () => fetchMarkets(), {
    refreshInterval: 30_000,
  });
  const stats = markets.data?.stats;
  const liveModels = [...(markets.data?.data ?? [])]
    .sort((left, right) => right.activeProviderCount - left.activeProviderCount)
    .slice(0, 3);

  return (
    <article className="sell-panel sell-panel--live">
      <div className="sell-panel__head-row">
        <p className="sell-panel__eyebrow">live on the marketplace</p>
        <span className="sell-live__badge">last 24h</span>
      </div>

      <div className="sell-live__models">
        {markets.isLoading && liveModels.length === 0 ? (
          <p className="quiet-note">Loading live models...</p>
        ) : liveModels.length === 0 ? (
          <p className="quiet-note">Be among the first sellers — list a model to capture demand.</p>
        ) : (
          liveModels.map((market, index) => {
            const benchmark = resolveMarketBenchmarkTaskUsd(market);
            const savingsPercent =
              benchmark != null && market.cheapestRateUsd != null
                ? (computeSavingsPercent(benchmark, market.cheapestRateUsd) ?? 0)
                : 0;

            return (
              <div className="sell-live__model-row" key={market.modelId}>
                <div className="sell-live__model-copy">
                  <ProviderBrandIcon modelProvider={market.modelProvider} />
                  <div>
                    <strong>{market.modelId}</strong>
                    <span>
                      {LIVE_TAGS[index] ?? 'live'} · {market.activeProviderCount} sellers
                    </span>
                  </div>
                </div>
                <SegmentBar
                  segments={16}
                  tone="volume"
                  value={Math.max(
                    12,
                    Math.min(100, savingsPercent || market.activeProviderCount * 8)
                  )}
                />
                <span className="sell-live__model-stat">
                  {savingsPercent > 0
                    ? `-${Math.round(savingsPercent)}%`
                    : formatUsd(market.cheapestRateUsd)}
                </span>
              </div>
            );
          })
        )}
      </div>

      <p className="sell-live__footer">
        {formatUsd(stats?.earnedBySellers24hUsd ?? 0)} earned by sellers ·{' '}
        {(stats?.routedRequests24h ?? 0).toLocaleString()} requests routed ·{' '}
        {stats?.activeOffers ?? 0} seller offers active · {stats?.modelsLive ?? 0} models live
      </p>
    </article>
  );
}
