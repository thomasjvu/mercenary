import type { ProviderHealth } from '../../api/client.js';

export function SellerHealthBadge({ health }: { health?: ProviderHealth }) {
  if (!health) {
    return <span className="health-badge health-badge--unknown">health n/a</span>;
  }

  if (health.ready) {
    return <span className="health-badge health-badge--ready">ready</span>;
  }

  if (health.reachable) {
    return <span className="health-badge health-badge--reachable">reachable</span>;
  }

  return (
    <span className="health-badge health-badge--offline" title={health.error}>
      offline
    </span>
  );
}
