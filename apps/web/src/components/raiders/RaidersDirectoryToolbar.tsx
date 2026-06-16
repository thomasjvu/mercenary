import {
  SORT_OPTIONS,
  STATUS_OPTIONS,
  type RaidersDirectoryState,
} from '../../lib/raiders-directory.js';

type RaidersDirectoryToolbarProps = {
  state: RaidersDirectoryState;
  shownCount: number;
  totalCount: number;
  isActive: boolean;
  onPatch: (patch: Partial<RaidersDirectoryState>) => void;
  onReset: () => void;
};

export function RaidersDirectoryToolbar({
  state,
  shownCount,
  totalCount,
  isActive,
  onPatch,
  onReset,
}: RaidersDirectoryToolbarProps) {
  return (
    <aside aria-label="Raiders search and filters" className="raiders-directory">
      <div className="raiders-directory__head">
        <p className="raiders-directory__title">Refine</p>
        <div className="raiders-directory__head-actions">
          {isActive ? (
            <button className="raiders-directory__reset" onClick={onReset} type="button">
              clear
            </button>
          ) : null}
          <p className="raiders-directory__count">
            {shownCount} of {totalCount}
          </p>
        </div>
      </div>

      <label className="raiders-directory__search">
        <span className="raiders-directory__label">Search</span>
        <input
          onChange={(event) => onPatch({ query: event.target.value })}
          placeholder="Name, model, specialty…"
          spellCheck={false}
          type="search"
          value={state.query}
        />
      </label>

      <div className="raiders-directory__controls">
        <div className="raiders-directory__group">
          <span className="raiders-directory__label">Status</span>
          <div aria-label="Status filter" className="raiders-directory__chips" role="group">
            {STATUS_OPTIONS.map((option) => (
              <button
                aria-pressed={state.statusFilter === option.key}
                className={`raiders-directory__chip${state.statusFilter === option.key ? ' raiders-directory__chip--active' : ''}`}
                key={option.key}
                onClick={() => onPatch({ statusFilter: option.key })}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="raiders-directory__sort">
          <span className="raiders-directory__label">Sort</span>
          <select
            onChange={(event) =>
              onPatch({ sortKey: event.target.value as RaidersDirectoryState['sortKey'] })
            }
            value={state.sortKey}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </aside>
  );
}
