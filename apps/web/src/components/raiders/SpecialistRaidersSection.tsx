import { RaiderRow } from './RaiderRow.js';
import { RaidersDirectoryToolbar } from './RaidersDirectoryToolbar.js';
import type { RaidersDirectoryState } from '../../lib/raiders-directory.js';
import type { RaiderRecord } from '../../lib/raiders.js';
import type { AppRoute } from '../../lib/app-routes.js';

type SpecialistRaidersSectionProps = {
  summaryLabel: string;
  state: RaidersDirectoryState;
  filteredRaiders: RaiderRecord[];
  totalCount: number;
  isActive: boolean;
  onPatch: (patch: Partial<RaidersDirectoryState>) => void;
  onReset: () => void;
  onNavigate: (path: AppRoute, options?: { mode?: 'inference' | 'raid'; modelId?: string }) => void;
};

export function SpecialistRaidersSection({
  summaryLabel,
  state,
  filteredRaiders,
  totalCount,
  isActive,
  onPatch,
  onReset,
  onNavigate,
}: SpecialistRaidersSectionProps) {
  return (
    <section aria-label="Specialist raiders" className="raiders-section">
      <div className="raiders-section__head">
        <h2 className="section-title">Specialist raiders</h2>
        <p className="raiders-section__meta">{summaryLabel}</p>
      </div>

      <RaidersDirectoryToolbar
        isActive={isActive}
        onPatch={onPatch}
        onReset={onReset}
        shownCount={filteredRaiders.length}
        state={state}
        totalCount={totalCount}
      />

      <div className="raiders-list">
        {filteredRaiders.length === 0 ? (
          <div className="raiders-directory__empty">
            <p className="eyebrow">no match</p>
            <p>Adjust the search or filters to find specialist raiders in the registry.</p>
            {isActive ? (
              <button className="button" onClick={onReset} type="button">
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
  );
}
