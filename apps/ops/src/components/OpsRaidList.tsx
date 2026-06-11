import type { RaidListItem } from '../api';
import { formatTimestamp } from './ops-ui';

export function OpsRaidList({
  raids,
  selectedRaidId,
  onSelect,
}: {
  raids: RaidListItem[];
  selectedRaidId: string | null;
  onSelect: (raidId: string) => void;
}) {
  if (raids.length === 0) {
    return <p className="quiet-note">No raids yet.</p>;
  }

  return (
    <div className="raid-list">
      {raids.slice(0, 8).map((raid) => (
        <button
          key={raid.raidId}
          className={`raid-list__item ${raid.raidId === selectedRaidId ? 'raid-list__item--active' : ''}`}
          onClick={() => onSelect(raid.raidId)}
          type="button"
        >
          <strong>{raid.raidId}</strong>
          <span>{raid.status}</span>
          <small>{formatTimestamp(raid.updatedAt)}</small>
        </button>
      ))}
    </div>
  );
}
