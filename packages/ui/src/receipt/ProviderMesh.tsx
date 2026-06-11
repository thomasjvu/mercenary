import type {
  ProviderHealthViewResponse,
  ProviderViewResponse,
  RaidStatusResponse,
} from '@bossraid/shared-types';

type ProviderMeshProps = {
  providers: ProviderViewResponse[];
  providerHealth: ProviderHealthViewResponse[];
  experts: RaidStatusResponse['experts'];
};

type MeshCellState = 'active' | 'ready' | 'warm' | 'down' | 'empty';

export function ProviderMesh({ providers, providerHealth, experts }: ProviderMeshProps) {
  const cells = Array.from({ length: 15 }, (_, index) => {
    const provider = providers[index];
    if (!provider) {
      return { key: `empty-${index}`, state: 'empty' as const, label: 'empty' };
    }

    const health = providerHealth.find((item) => item.providerId === provider.providerId);
    const expert = experts.find((item) => item.providerId === provider.providerId);

    let state: MeshCellState;
    if (expert && !['timed_out', 'failed', 'invalid'].includes(expert.status)) {
      state = 'active';
    } else if (health?.ready) {
      state = 'ready';
    } else if (health?.reachable || provider.status === 'available') {
      state = 'warm';
    } else {
      state = 'down';
    }

    return {
      key: provider.providerId,
      state,
      label: provider.displayName,
    };
  });

  const rows = [cells.slice(0, 5), cells.slice(5, 10), cells.slice(10, 15)];

  return (
    <div className="mesh-panel">
      <div className="mesh-summary">
        <div>
          <span>armed</span>
          <strong>{cells.filter((cell) => cell.state === 'active').length}</strong>
        </div>
        <div>
          <span>ready</span>
          <strong>{cells.filter((cell) => cell.state === 'ready').length}</strong>
        </div>
        <div>
          <span>down</span>
          <strong>{cells.filter((cell) => cell.state === 'down').length}</strong>
        </div>
      </div>
      <div className="mesh-board" aria-label="Provider mesh activity">
        {rows.map((row, rowIndex) => (
          <div
            className={`mesh-row ${rowIndex % 2 === 1 ? 'mesh-row--offset' : ''}`}
            key={rowIndex}
          >
            {row.map((cell) => (
              <div className={`mesh-cell mesh-cell--${cell.state}`} key={cell.key}>
                <span>{cell.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
