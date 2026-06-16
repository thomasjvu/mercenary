import { SegmentBar } from '../system/SegmentBar.js';
import type { SellerUpstreamOnboardingState } from '../../hooks/useSellerUpstreamOnboarding.js';

type SellerDemandPanelProps = {
  state: Pick<SellerUpstreamOnboardingState, 'demandByModel' | 'maxDemandValue'>;
};

export function SellerDemandPanel({ state }: SellerDemandPanelProps) {
  const { demandByModel, maxDemandValue } = state;

  return (
    <article className="sell-panel sell-panel--demand">
      <p className="sell-panel__eyebrow">your demand by model</p>
      <p className="quiet-note">
        Boss Raid routed volume in the last 24h by model, with catalog reference token rates.
      </p>
      {demandByModel.length === 0 ? (
        <div className="sell-empty sell-empty--compact">
          <p>Demand bars appear once offers are live.</p>
        </div>
      ) : (
        <div className="sell-demand-list">
          {demandByModel.map((entry) => (
            <div className="sell-demand-list__row" key={entry.modelId}>
              <div className="sell-demand-list__copy">
                <strong>{entry.modelId}</strong>
                <span>{entry.displayName}</span>
                {entry.referenceInputPer1mUsd != null ? (
                  <span className="sell-demand-list__rates">
                    ${entry.referenceInputPer1mUsd.toFixed(2)} in / $
                    {entry.referenceOutputPer1mUsd?.toFixed(2) ?? '0.00'} out per M
                  </span>
                ) : null}
              </div>
              <SegmentBar
                segments={20}
                tone="volume"
                value={Math.max(8, Math.round((entry.routedValue24hUsd / maxDemandValue) * 100))}
              />
              <span className="sell-demand-list__stat">
                {entry.routedRequests24h} req · ${entry.routedValue24hUsd.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
