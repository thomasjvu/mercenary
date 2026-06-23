import { startTransition } from 'react';
import type { Provider, ProviderHealth } from '../api';
import { buildErc8004ProofLabel, hasErc8004Registration } from '@bossraid/proof-ui';
import { OpsKpiTile, OpsStatusOrb, ProviderScoreBars } from './ops-visual';

type OpsProviderSidebarProps = {
  providerQuery: string;
  filteredProviders: Provider[];
  providerHealth: ProviderHealth[] | undefined;
  onQueryChange: (value: string) => void;
};

function ProviderCard({
  provider,
  health,
}: {
  provider: Provider;
  health: ProviderHealth | undefined;
}) {
  const readyState = health?.ready ? 'ready' : health?.reachable ? 'warm' : 'down';
  const erc8004Label = buildErc8004ProofLabel(
    provider.erc8004?.verification?.status,
    hasErc8004Registration(provider)
  );

  return (
    <article className="ops-provider-card">
      <div className="ops-provider-card__head">
        <div>
          <strong>{provider.displayName}</strong>
          <span className="quiet-note">{provider.modelFamily ?? 'unknown'}</span>
        </div>
        <OpsStatusOrb label={readyState} state={readyState} />
      </div>
      <ProviderScoreBars
        privacy={provider.scores?.privacyScore ?? 0}
        reputation={provider.scores?.reputationScore ?? 0}
        trust={provider.trust?.score ?? 0}
      />
      <div className="ops-provider-card__meta">
        <span>{provider.outputTypes?.join(' / ') || 'n/a'}</span>
        <span>{erc8004Label}</span>
      </div>
    </article>
  );
}

export function OpsProviderSidebar({
  providerQuery,
  filteredProviders,
  providerHealth,
  onQueryChange,
}: OpsProviderSidebarProps) {
  const readyCount = filteredProviders.filter((provider) => {
    const health = providerHealth?.find((item) => item.providerId === provider.providerId);
    return health?.ready;
  }).length;

  return (
    <section className="ops-registry">
      <div className="ops-kpi-grid ops-kpi-grid--compact">
        <OpsKpiTile icon="providers" label="visible" value={String(filteredProviders.length)} />
        <OpsKpiTile icon="mesh" label="ready" tone="good" value={String(readyCount)} />
      </div>

      <article className="ops-panel ops-panel--providers">
        <div className="panel-head panel-head--compact">
          <div>
            <p className="eyebrow">registry</p>
            <h3>Providers</h3>
          </div>
          <input
            className="search ops-provider-search"
            placeholder="filter"
            value={providerQuery}
            onChange={(event) => {
              const nextValue = event.target.value;
              startTransition(() => onQueryChange(nextValue));
            }}
          />
        </div>
        <div className="ops-provider-grid">
          {filteredProviders.slice(0, 12).map((provider) => (
            <ProviderCard
              key={provider.providerId}
              health={providerHealth?.find((item) => item.providerId === provider.providerId)}
              provider={provider}
            />
          ))}
          {filteredProviders.length === 0 ? (
            <p className="quiet-note">No providers match.</p>
          ) : null}
        </div>
      </article>
    </section>
  );
}
