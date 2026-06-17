import { MERCENARY_ORCHESTRATOR } from '../../lib/orchestrators.js';
import type { RaiderRecord } from '../../lib/raiders.js';
import type { AppRoute } from '../../lib/app-routes.js';

type OrchestratorAgentsSectionProps = {
  orchestratorRaiders: RaiderRecord[];
  onNavigate: (path: AppRoute, options?: { mode?: 'inference' | 'raid'; modelId?: string }) => void;
};

export function OrchestratorAgentsSection({
  orchestratorRaiders,
  onNavigate,
}: OrchestratorAgentsSectionProps) {
  return (
    <section aria-label="Orchestrator agents" className="raiders-section">
      <h2 className="section-title">Orchestrator agents</h2>
      <div className="orchestrator-grid">
        <article className="orchestrator-card orchestrator-card--primary">
          <div className="orchestrator-card__copy">
            <strong>{MERCENARY_ORCHESTRATOR.displayName}</strong>
            <span>{MERCENARY_ORCHESTRATOR.id}</span>
            <p>{MERCENARY_ORCHESTRATOR.description}</p>
          </div>
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
  );
}
