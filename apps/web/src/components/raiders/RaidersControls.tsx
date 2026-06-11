import { SORT_OPTIONS, STATUS_OPTIONS, type SortKey, type StatusFilter } from '../../lib/raiders';

type RaidersControlsProps = {
  query: string;
  sortKey: SortKey;
  statusFilter: StatusFilter;
  filteredCount: number;
  registeredCount: number;
  verifiedCount: number;
  privacyCount: number;
  veniceCount: number;
  veteranCount: number;
  onQueryChange: (value: string) => void;
  onSortKeyChange: (value: SortKey) => void;
  onStatusFilterChange: (value: StatusFilter) => void;
};

export function RaidersControls({
  query,
  sortKey,
  statusFilter,
  filteredCount,
  registeredCount,
  verifiedCount,
  privacyCount,
  veniceCount,
  veteranCount,
  onQueryChange,
  onSortKeyChange,
  onStatusFilterChange,
}: RaidersControlsProps) {
  return (
    <div className="directory-controls">
      <label className="directory-search">
        <span className="directory-search__label">search</span>
        <input
          className="directory-search__input"
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="name / model / specialty"
          spellCheck={false}
          type="text"
          value={query}
        />
      </label>

      <div className="directory-filters">
        <div className="directory-filter-group">
          <span className="directory-filter-group__label">status</span>
          <div className="directory-pill-row">
            {STATUS_OPTIONS.map((option) => (
              <button
                className={`directory-pill ${statusFilter === option.key ? 'directory-pill--active' : ''}`}
                key={option.key}
                onClick={() => onStatusFilterChange(option.key)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="directory-filter-group">
          <span className="directory-filter-group__label">sort</span>
          <div className="directory-pill-row">
            {SORT_OPTIONS.map((option) => (
              <button
                className={`directory-pill ${sortKey === option.key ? 'directory-pill--active' : ''}`}
                key={option.key}
                onClick={() => onSortKeyChange(option.key)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="directory-main__summary">
        <span>{filteredCount} shown</span>
        <span>{registeredCount} registered</span>
        <span>{verifiedCount} verified</span>
        <span>{privacyCount} privacy-ready</span>
        <span>{veniceCount} venice</span>
        <span>{veteranCount} veterans</span>
      </div>
    </div>
  );
}
