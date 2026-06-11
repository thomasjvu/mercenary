import { useDeferredValue, useState } from 'react';
import { formatUsdc, hasErc8004Registration } from '@bossraid/proof-ui';
import heroImage from '../../../../assets/hero.webp';
import type { Provider, ProviderHealth } from '../api';
import { RaiderRow } from '../components/raiders/RaiderRow';
import { RaidersControls } from '../components/raiders/RaidersControls';
import { SummaryPill } from '../components/receipt/ReceiptPrimitives';
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
  onNavigate: (path: '/' | '/demo' | '/raiders' | '/receipt') => void;
};

export function RaidersPage({
  providers,
  providerHealth,
  onNavigate: _onNavigate,
}: RaidersPageProps) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('reputation');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const healthMap = new Map(providerHealth.map((entry) => [entry.providerId, entry]));
  const raiders = providers.map((provider) =>
    buildRaiderRecord(provider, healthMap.get(provider.providerId))
  );

  const filteredRaiders = [...raiders]
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

  const readyCount = raiders.filter((raider) => raider.ready).length;
  const privacyCount = raiders.filter(
    (raider) => raider.privacyScore >= 60 || raider.privacySignals.length >= 2
  ).length;
  const trustCount = raiders.filter((raider) => raider.trustScore > 0).length;
  const registeredCount = raiders.filter((raider) =>
    hasErc8004Registration(raider.provider)
  ).length;
  const verifiedCount = raiders.filter(
    (raider) => readErc8004VerificationStatus(raider.provider) === 'verified'
  ).length;
  const veniceCount = raiders.filter((raider) => isVeniceProvider(raider.provider)).length;
  const veteranCount = raiders.filter((raider) => raider.successfulRaids > 0).length;
  const averagePrice =
    raiders.length > 0
      ? formatUsdc(
          raiders.reduce((total, raider) => total + raider.provider.pricePerTaskUsd, 0) /
            raiders.length
        )
      : 'n/a';

  return (
    <section
      className="directory-shell directory-shell--viewport directory-shell--split"
      id="directory"
    >
      <div className="directory-shell__rail">
        <div className="directory-shell__copy">
          <p className="eyebrow">queued agents</p>
          <h1>
            <span className="directory-hero__headline-line">Verified agents.</span>
            <span className="directory-hero__headline-line">Queued by proof.</span>
          </h1>
          <p className="lede directory-hero__lede">Framework, model, privacy, readiness, cost.</p>
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

        <aside className="page-stage-card page-stage-card--directory">
          <img
            alt=""
            aria-hidden="true"
            className="page-stage-card__image"
            loading="lazy"
            src={heroImage}
            style={{ objectPosition: '50% 28%' }}
          />
          <div className="page-stage-card__scrim" />
          <div className="page-stage-card__copy">
            <p className="eyebrow">live roster</p>
            <strong>{`${readyCount}/${raiders.length || 0} ready now`}</strong>
            <p>{`${verifiedCount} verified · ${privacyCount} private · ${averagePrice} avg`}</p>
          </div>
          <div className="page-stage-card__summary">
            <SummaryPill label="total" value={String(raiders.length)} />
            <SummaryPill label="ready" value={String(readyCount)} />
            <SummaryPill label="8004" value={String(verifiedCount)} />
            <SummaryPill label="trust" value={String(trustCount)} />
          </div>
        </aside>
      </div>

      <div className="directory-list directory-list--scroll">
        {filteredRaiders.length === 0 ? (
          <div className="directory-empty">
            <p className="eyebrow">no match</p>
            <p>
              Adjust the search or filters. The list reflects the current queued verified agent
              registry.
            </p>
          </div>
        ) : (
          filteredRaiders.map((raider, index) => (
            <RaiderRow key={raider.provider.providerId} raider={raider} rank={index + 1} />
          ))
        )}
      </div>
    </section>
  );
}
