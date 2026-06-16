import type { UpstreamProviderId } from '@bossraid/constants';
import { upstreamProviderLabel } from '../../api/seller-upstream.js';
import type { SellerUpstreamOnboardingState } from '../../hooks/useSellerUpstreamOnboarding.js';

type SellerSavedConfigsPanelProps = {
  state: Pick<SellerUpstreamOnboardingState, 'upstreamStatus' | 'setProvider'>;
};

export function SellerSavedConfigsPanel({ state }: SellerSavedConfigsPanelProps) {
  const { upstreamStatus, setProvider } = state;

  if (!upstreamStatus.data || upstreamStatus.data.providers.length === 0) {
    return null;
  }

  return (
    <article className="sell-panel sell-panel--configs">
      <div className="sell-panel__head-row">
        <p className="sell-panel__eyebrow">saved configurations</p>
        <span className="quiet-note">{upstreamStatus.data.providers.length} saved</span>
      </div>
      <div className="sell-config-grid">
        {upstreamStatus.data.providers.map((config) => (
          <button
            className="sell-config-card"
            key={config.configId}
            onClick={() => setProvider(config.provider as UpstreamProviderId)}
            type="button"
          >
            <strong>{upstreamProviderLabel(config.provider)}</strong>
            <span>{config.keyPrefix}</span>
            <span>Saved {new Date(config.updatedAt).toLocaleDateString()}</span>
          </button>
        ))}
      </div>
    </article>
  );
}
