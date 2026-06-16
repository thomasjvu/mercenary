import { useDeferredValue, useState } from 'react';
import { hasErc8004Registration } from '@bossraid/proof-ui';
import type { Provider, ProviderHealth } from '../api';
import { RaiderRow } from '../components/raiders/RaiderRow';
import { RaidersControls } from '../components/raiders/RaidersControls';
import { OrchestratorFeatured } from '../components/raiders/OrchestratorFeatured.js';
import { MERCENARY_ORCHESTRATOR, partitionRaiders } from '../lib/orchestrators.js';
import type { AppRoute } from '../lib/app-routes.js';
import {
  buildRaiderRecord,
  compareRaiders,
  isVeniceProvider,
  readErc8004VerificationStatus,
  type SortKey,
  type StatusFilter,
} from '../lib/raiders';

type RaidersPageProps = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
  onNavigate: (path: AppRoute, options?: { mode?: 'inference' | 'raid'; modelId?: string }) => void;
};

export function RaidersPage({ providers, providerHealth, onNavigate }: RaidersPageProps) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('reputation');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const healthMap = new Map(providerHealth.map((entry) => [entry.providerId, entry]));
  const { orchestrators, specialists } = partitionRaiders(providers);
  const specialistRaiders = specialists.map((provider) =>
    buildRaiderRecord(provider, healthMap.get(provider.providerId))
  );
  const orchestratorRaiders = orchestrators.map((provider) =>
    buildRaiderRecord(provider, healthMap.get(provider.providerId))
  );

  const filteredRaiders = [...specialistRaiders]
    .filter((raider) => {
      if (statusFilter === 'ready' && !raider.ready) {
        return false;
      }
      if (statusFilter === 'available' && raider.activityTone === 'offline') {
        return false;
      }
      if (statusFilter === 'offline' && raider.activityTone !== 'offline') {
        return false;
      }
      if (!deferredQuery) {
        return true;
      }
      return raider.searchIndex.includes(deferredQuery);
    })
    .sort((left, right) => compareRaiders(left, right, sortKey));

  const readyCount = specialistRaiders.filter((raider) => raider.ready).length;
  const privacyCount = specialistRaiders.filter(
    (raider) => raider.privacyScore >= 60 || raider.privacySignals.length >= 2
  ).length;
  const registeredCount = specialistRaiders.filter((raider) =>
    hasErc8004Registration(raider.provider)
  ).length;
  const verifiedCount = specialistRaiders.filter(
    (raider) => readErc8004VerificationStatus(raider.provider) === 'verified'
  ).length;
  const veniceCount = specialistRaiders.filter((raider) =>
    isVeniceProvider(raider.provider)
  ).length;
  const veteranCount = specialistRaiders.filter((raider) => raider.successfulRaids > 0).length;

  return (
    <section className="beta-page page-flat raiders-page">
      <OrchestratorFeatured onChat={() => onNavigate('/mercenary')} />

      <section aria-label="Orchestrator agents" className="raiders-section">
        <h2 className="section-title">Orchestrator agents</h2>
        <div className="orchestrator-grid">
          <article className="orchestrator-card orchestrator-card--primary">
            <div className="orchestrator-card__copy">
              <strong>{MERCENARY_ORCHESTRATOR.displayName}</strong>
              <span>{MERCENARY_ORCHESTRATOR.id}</span>
              <p>{MERCENARY_ORCHESTRATOR.description}</p>
            </div>
            <button
              className="button button--primary"
              onClick={() => onNavigate('/mercenary')}
              type="button"
            >
              open chat
            </button>
          </article>
          {orchestratorRaiders.map((raider) => (
            <article className="orchestrator-card" key={raider.provider.providerId}>
              <div className="orchestrator-card__copy">
                <strong>{raider.provider.displayName}</strong>
                <span>{raider.provider.providerId}</span>
                <p>{raider.provider.description ?? 'Registered orchestrator agent.'}</p>
              </div>
              <button
                className="button"
                onClick={() =>
                  onNavigate('/playground', {
                    modelId: raider.provider.modelId ?? undefined,
                  })
                }
                type="button"
              >
                try
              </button>
            </article>
          ))}
        </div>
      </section>

      <section aria-label="Specialist raiders" className="raiders-section">
        <div className="raiders-section__head">
          <h2 className="section-title">Specialist raiders</h2>
          <p className="raiders-section__meta">
            {`${readyCount}/${specialistRaiders.length || 0} ready · ${verifiedCount} verified · ${privacyCount} private`}
          </p>
        </div>

        <RaidersControls
          filteredCount={filteredRaiders.length}
          onQueryChange={setQuery}
          onSortKeyChange={setSortKey}
          onStatusFilterChange={setStatusFilter}
          privacyCount={privacyCount}
          query={query}
          registeredCount={registeredCount}
          sortKey={sortKey}
          statusFilter={statusFilter}
          veniceCount={veniceCount}
          verifiedCount={verifiedCount}
          veteranCount={veteranCount}
        />

        <div className="raiders-list">
          {filteredRaiders.length === 0 ? (
            <div className="directory-empty">
              <p className="eyebrow">no match</p>
              <p>Adjust the search or filters to find specialist raiders in the registry.</p>
            </div>
          ) : (
            filteredRaiders.map((raider, index) => (
              <RaiderRow
                key={raider.provider.providerId}
                onMarket={() => onNavigate('/marketplace')}
                onTry={() =>
                  onNavigate('/playground', {
                    modelId: raider.provider.modelId ?? undefined,
                  })
                }
                raider={raider}
                rank={index + 1}
              />
            ))
          )}
        </div>
      </section>
    </section>
  );
}
