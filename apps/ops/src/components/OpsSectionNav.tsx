import { OpsIcon, type OpsIconName } from './ops-visual';

export type OpsSectionId = 'live' | 'launch' | 'platform' | 'providers';

const SECTIONS: Array<{ id: OpsSectionId; label: string; icon: OpsIconName }> = [
  { id: 'live', label: 'live', icon: 'live' },
  { id: 'launch', label: 'launch', icon: 'launch' },
  { id: 'platform', label: 'platform', icon: 'platform' },
  { id: 'providers', label: 'providers', icon: 'providers' },
];

type OpsSectionNavProps = {
  activeSection: OpsSectionId;
  onSelect: (section: OpsSectionId) => void;
};

export function OpsSectionNav({ activeSection, onSelect }: OpsSectionNavProps) {
  return (
    <nav aria-label="Ops sections" className="ops-section-nav">
      {SECTIONS.map((section) => (
        <button
          aria-current={activeSection === section.id ? 'page' : undefined}
          className={`ops-section-nav__item${activeSection === section.id ? ' ops-section-nav__item--active' : ''}`}
          key={section.id}
          onClick={() => onSelect(section.id)}
          type="button"
        >
          <OpsIcon name={section.icon} size={16} />
          <span>{section.label}</span>
        </button>
      ))}
    </nav>
  );
}

export function readOpsSectionFromHash(): OpsSectionId {
  if (typeof window === 'undefined') {
    return 'live';
  }

  const hash = window.location.hash.replace(/^#/, '');
  if (hash === 'launch' || hash === 'platform' || hash === 'providers' || hash === 'live') {
    return hash;
  }

  return 'live';
}

export function writeOpsSectionHash(section: OpsSectionId): void {
  if (typeof window === 'undefined') {
    return;
  }

  const nextHash = `#${section}`;
  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, '', nextHash);
  }
}
