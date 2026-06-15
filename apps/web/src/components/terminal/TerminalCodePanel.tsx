import { Icon } from '@iconify/react';

export type TerminalPanelLayer = 'front' | 'mid' | 'back';
export type TerminalPanelTheme = 'chat' | 'raid' | 'mcp';

type TerminalCodePanelProps = {
  label: string;
  note?: string;
  code: string;
  theme: TerminalPanelTheme;
  layer: TerminalPanelLayer;
  onFocus?: () => void;
  actionLabel?: string;
  onAction?: () => void;
};

export function TerminalCodePanel({
  label,
  note,
  code,
  theme,
  layer,
  onFocus,
  actionLabel,
  onAction,
}: TerminalCodePanelProps) {
  return (
    <article
      className={`terminal-window terminal-window--${theme} terminal-window--${layer}`}
      onClick={onFocus}
    >
      <div className="terminal-window__head">
        <div>
          {note ? <p className="eyebrow">{note}</p> : null}
          <h2>{label}</h2>
        </div>
        {onAction && actionLabel ? (
          <button className="button" onClick={onAction} type="button">
            <Icon aria-label={actionLabel} className="icon icon--pixel" icon="pixel:copy-solid" />
          </button>
        ) : null}
      </div>
      <pre className="code-panel">{code}</pre>
    </article>
  );
}
