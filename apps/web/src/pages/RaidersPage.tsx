import type { Provider, ProviderHealth } from '../api';
import { OrchestratorFeatured } from '../components/raiders/OrchestratorFeatured.js';
import { OrchestratorAgentsSection } from '../components/raiders/OrchestratorAgentsSection.js';
import { SpecialistRaidersSection } from '../components/raiders/SpecialistRaidersSection.js';
import type { AppRoute } from '../lib/app-routes.js';
import { buildRaiderRecord, summarizeRaiderDirectory } from '../lib/raiders';
import { partitionRaiders } from '../lib/orchestrators.js';
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
  const summary = summarizeRaiderDirectory(specialistRaiders);
  const summaryLabel = `${summary.readyCount}/${summary.totalCount || 0} ready · ${summary.verifiedCount} verified · ${summary.privacyCount} private`;

  return (
    <section className="beta-page page-flat raiders-page">
      <OrchestratorFeatured onChat={() => onNavigate('/mercenary')} />
      <OrchestratorAgentsSection
        onNavigate={onNavigate}
        orchestratorRaiders={orchestratorRaiders}
      />
      <SpecialistRaidersSection
        filteredRaiders={filteredRaiders}
        isActive={isActive}
        onNavigate={onNavigate}
        onPatch={patchState}
        onReset={reset}
        state={state}
        summaryLabel={summaryLabel}
        totalCount={specialistRaiders.length}
      />
    </section>
  );
}
