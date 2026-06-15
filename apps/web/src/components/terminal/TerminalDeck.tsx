import { useEffect, useState, type ReactNode } from 'react';
import { TerminalCodePanel, type TerminalPanelLayer } from './TerminalCodePanel.js';

export type TerminalDeckPanel = {
  id: string;
  tabLabel: string;
  tabClass?: string;
  label: string;
  note?: string;
  code: string;
  theme: 'chat' | 'raid' | 'mcp';
};

type TerminalDeckProps = {
  eyebrow?: string;
  panels: readonly TerminalDeckPanel[];
  defaultPanelId?: string;
  autoRotateMs?: number;
  copiedKey?: string | null;
  onCopy?: (panelId: string, code: string) => void;
  headerAside?: ReactNode;
};

function getPanelLayer(
  activeId: string,
  panelId: string,
  panelIds: readonly string[]
): TerminalPanelLayer {
  const activeIndex = panelIds.indexOf(activeId);
  const panelIndex = panelIds.indexOf(panelId);
  const relativeIndex = (panelIndex - activeIndex + panelIds.length) % panelIds.length;

  if (relativeIndex === 0) {
    return 'front';
  }

  if (relativeIndex === 1) {
    return 'mid';
  }

  return 'back';
}

export function TerminalDeck({
  eyebrow = 'private surfaces',
  panels,
  defaultPanelId,
  autoRotateMs = 45_000,
  copiedKey,
  onCopy,
  headerAside,
}: TerminalDeckProps) {
  const panelIds = panels.map((panel) => panel.id);
  const [activePanelId, setActivePanelId] = useState(defaultPanelId ?? panels[0]?.id ?? '');
  const [autoRotate, setAutoRotate] = useState(Boolean(autoRotateMs));

  useEffect(() => {
    if (!autoRotate || !autoRotateMs || panels.length < 2) {
      return;
    }

    const timer = window.setInterval(() => {
      setActivePanelId((current) => {
        const index = panelIds.indexOf(current);
        return panelIds[(index + 1) % panelIds.length] ?? current;
      });
    }, autoRotateMs);

    return () => window.clearInterval(timer);
  }, [autoRotate, autoRotateMs, panelIds, panels.length]);

  function selectPanel(panelId: string) {
    setAutoRotate(false);
    setActivePanelId(panelId);
  }

  return (
    <div className="terminal-deck">
      <div className="terminal-deck__header">
        <p className="eyebrow">{eyebrow}</p>
        <div className="terminal-deck__header-end">
          <div className="terminal-deck__tabs" role="tablist" aria-label="Integration surfaces">
            {panels.map((panel) => (
              <button
                aria-selected={activePanelId === panel.id}
                className={`deck-tab ${panel.tabClass ?? ''}${activePanelId === panel.id ? ` ${panel.tabClass ?? ''}--active deck-tab--active` : ''}`}
                key={panel.id}
                onClick={() => selectPanel(panel.id)}
                type="button"
              >
                {panel.tabLabel}
              </button>
            ))}
          </div>
          {headerAside}
        </div>
      </div>
      <div className="terminal-stack">
        {panels.map((panel) => (
          <TerminalCodePanel
            actionLabel={copiedKey === panel.id ? 'copied' : 'copy'}
            code={panel.code}
            key={panel.id}
            label={panel.label}
            layer={getPanelLayer(activePanelId, panel.id, panelIds)}
            note={panel.note}
            onAction={onCopy ? () => onCopy(panel.id, panel.code) : undefined}
            onFocus={() => setActivePanelId(panel.id)}
            theme={panel.theme}
          />
        ))}
      </div>
    </div>
  );
}
