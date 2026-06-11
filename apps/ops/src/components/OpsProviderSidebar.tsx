import { startTransition } from 'react';
import type { Provider, ProviderHealth } from '../api';
import { ProviderRow } from './ops-ui';

type OpsProviderSidebarProps = {
  providerQuery: string;
  filteredProviders: Provider[];
  providerHealth: ProviderHealth[] | undefined;
  onQueryChange: (value: string) => void;
};

export function OpsProviderSidebar({
  providerQuery,
  filteredProviders,
  providerHealth,
  onQueryChange,
}: OpsProviderSidebarProps) {
  return (
    <section className="ops-registry">
      <article className="ops-panel ops-panel--providers">
        <div className="panel-head">
          <div>
            <p className="ops-label">providers</p>
            <h3>Registry</h3>
          </div>
          <input
            className="search"
            placeholder="search"
            value={providerQuery}
            onChange={(event) => {
              const nextValue = event.target.value;
              startTransition(() => onQueryChange(nextValue));
            }}
          />
        </div>
        <div className="provider-list">
          {filteredProviders.slice(0, 10).map((provider) => (
            <ProviderRow
              key={provider.providerId}
              provider={provider}
              health={providerHealth?.find((item) => item.providerId === provider.providerId)}
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
