import { Icon } from '@iconify/react';
import heroImage from '../../assets/hero.webp';
import { BossRaidMark } from '../BossRaidMark.js';
import { MERCENARY_ORCHESTRATOR } from '../../lib/orchestrators.js';

type OrchestratorFeaturedProps = {
  onChat: () => void;
};

export function OrchestratorFeatured({ onChat }: OrchestratorFeaturedProps) {
  return (
    <article className="orchestrator-featured">
      <div className="orchestrator-featured__visual">
        <img
          alt=""
          className="orchestrator-featured__image"
          src={heroImage}
          style={{ objectPosition: '50% 22%' }}
        />
        <div className="orchestrator-featured__scrim" />
        <BossRaidMark />
      </div>
      <div className="orchestrator-featured__copy">
        <p className="orchestrator-featured__eyebrow">featured orchestrator</p>
        <h2>{MERCENARY_ORCHESTRATOR.displayName}</h2>
        <p>{MERCENARY_ORCHESTRATOR.description}</p>
        <div className="orchestrator-featured__tags">
          {MERCENARY_ORCHESTRATOR.specializations.map((tag) => (
            <span className="orchestrator-featured__tag" key={tag}>
              {tag}
            </span>
          ))}
        </div>
        <button className="button button--primary" onClick={onChat} type="button">
          <Icon className="icon icon--pixel" icon="pixel:message-dots-solid" />
          Chat with Mercenary
        </button>
      </div>
    </article>
  );
}
