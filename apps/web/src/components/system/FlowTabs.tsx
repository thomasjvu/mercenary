import type { ReactNode } from 'react';

export type FlowTabTone = 'blue' | 'yellow' | 'red';

export type FlowTab = {
  id: string;
  label: string;
  tone?: FlowTabTone;
};

type FlowTabsProps = {
  activeId: string;
  onChange: (id: string) => void;
  tabs: readonly FlowTab[];
};

export function FlowTabs({ activeId, onChange, tabs }: FlowTabsProps) {
  return (
    <div className="flow-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          aria-selected={activeId === tab.id}
          className={`flow-tabs__tab${tab.tone ? ` flow-tabs__tab--${tab.tone}` : ''}${activeId === tab.id ? ' flow-tabs__tab--active' : ''}`}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          role="tab"
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

type FlowPanelProps = {
  active: boolean;
  children: ReactNode;
  id: string;
};

export function FlowPanel({ active, children, id }: FlowPanelProps) {
  if (!active) {
    return null;
  }

  return (
    <div className="flow-panel" id={id} role="tabpanel">
      {children}
    </div>
  );
}
