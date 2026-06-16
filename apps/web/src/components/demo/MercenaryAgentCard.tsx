import mercenaryPfp from '@assets/boss-raid-pfp.png';
import { MERCENARY_ORCHESTRATOR } from '../../lib/orchestrators.js';

export function MercenaryAgentCard() {
  return (
    <section aria-label="Mercenary agent" className="mercenary-agent-card">
      <img
        alt={`${MERCENARY_ORCHESTRATOR.displayName} profile`}
        className="mercenary-agent-card__avatar"
        src={mercenaryPfp}
      />
      <div className="mercenary-agent-card__copy">
        <span className="mercenary-agent-card__eyebrow">{MERCENARY_ORCHESTRATOR.role}</span>
        <strong>{MERCENARY_ORCHESTRATOR.displayName}</strong>
      </div>
    </section>
  );
}
