import mercenaryPfp from '@assets/boss-raid-pfp.png';
import { MERCENARY_ORCHESTRATOR } from '../../lib/orchestrators.js';

type OrchestratorFeaturedProps = {
  onChat: () => void;
};

export function OrchestratorFeatured({ onChat }: OrchestratorFeaturedProps) {
  return (
    <article className="orchestrator-featured">
      <div className="orchestrator-featured__main">
        <div className="orchestrator-featured__visual">
          <img
            alt={`${MERCENARY_ORCHESTRATOR.displayName} profile`}
            className="orchestrator-featured__image"
            src={mercenaryPfp}
          />
        </div>
        <div className="orchestrator-featured__copy">
          <h2>{MERCENARY_ORCHESTRATOR.displayName}</h2>
          <p>{MERCENARY_ORCHESTRATOR.description}</p>
        </div>
      </div>
      <button
        className="button button--primary info-panel__cta rx-spacebar-clip orchestrator-featured__cta"
        onClick={onChat}
        type="button"
      >
        Chat with Mercenary
      </button>
    </article>
  );
}
