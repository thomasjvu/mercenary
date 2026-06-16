import type { Provider, ProviderHealth } from '../api';
import { RaiderRow } from '../components/raiders/RaiderRow';
import { RaidersDirectoryToolbar } from '../components/raiders/RaidersDirectoryToolbar.js';
import { OrchestratorFeatured } from '../components/raiders/OrchestratorFeatured.js';
import { MERCENARY_ORCHESTRATOR, partitionRaiders } from '../lib/orchestrators.js';
import type { AppRoute } from '../lib/app-routes.js';
import { buildRaiderRecord, readErc8004VerificationStatus } from '../lib/raiders';
import { useRaidersDirectory } from '../lib/use-raiders-directory.js';

type RaidersPageProps = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
  onNavigate: (path: AppRoute, options?: { mode?: 'inference' | 'raid'; modelId?: string }) => void;
};

export function RaidersPage({ providers, providerHealth, onNavigate }: RaidersPageProps) {
  const healthMap = new Map(providerHealth.map((entry) => [entry.providerId, entry]));
  const { orchestrators, specialists } = partitionRaiders(providers);
  const specialistRaiders = specialists.map((provider) =>
    buildRaiderRecord(provider, healthMap.get(provider.providerId))
  );
  const orchestratorRaiders = orchestrators.map((provider) =>
    buildRaiderRecord(provider, healthMap.get(provider.providerId))
  );
  const { state, filteredRaiders, patchState, reset, isActive } =
    useRaidersDirectory(specialistRaiders);

  const readyCount = specialistRaiders.filter((raider) => raider.ready).length;
  const privacyCount = specialistRaiders.filter(
    (raider) => raider.privacyScore >= 60 || raider.privacySignals.length >= 2
  ).length;
  const verifiedCount = specialistRaiders.filter(
    (raider) => readErc8004VerificationStatus(raider.provider) === 'verified'
  ).length;

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

        <RaidersDirectoryToolbar
          isActive={isActive}
          onPatch={patchState}
          onReset={reset}
          shownCount={filteredRaiders.length}
          state={state}
          totalCount={specialistRaiders.length}
        />

        <div className="raiders-list">
          {filteredRaiders.length === 0 ? (
            <div className="raiders-directory__empty">
              <p className="eyebrow">no match</p>
              <p>Adjust the search or filters to find specialist raiders in the registry.</p>
              {isActive ? (
                <button className="button" onClick={reset} type="button">
                  clear filters
                </button>
              ) : null}
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
