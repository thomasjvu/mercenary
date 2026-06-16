import type { DemoRequestMode } from '../../demo-result.js';
import { buildDemoModeChipLabel } from '../../demo-result.js';

type MercenaryChatHeaderProps = {
  demoMode: DemoRequestMode;
  balanceUsd?: number;
  isAuthenticated: boolean;
  hasConversation: boolean;
  isLaunching: boolean;
  onDemoModeChange: (mode: DemoRequestMode) => void;
  onResetConversation: () => void;
};

export function MercenaryChatHeader({
  demoMode,
  balanceUsd,
  isAuthenticated,
  hasConversation,
  isLaunching,
  onDemoModeChange,
  onResetConversation,
}: MercenaryChatHeaderProps) {
  const balanceLabel = isAuthenticated ? `$${(balanceUsd ?? 0).toFixed(2)} credit` : null;

  return (
    <header className="mercenary-chat__header">
      <div className="mercenary-chat__header-main">
        <strong className="mercenary-chat__title">Mercenary</strong>
        <div className="mercenary-toolbar__group" role="group" aria-label="Request lane">
          <button
            aria-selected={demoMode === 'raid'}
            className={`mercenary-toolbar__chip mercenary-toolbar__chip--raid${demoMode === 'raid' ? ' mercenary-toolbar__chip--active' : ''}`}
            onClick={() => onDemoModeChange('raid')}
            type="button"
          >
            {buildDemoModeChipLabel('raid')}
          </button>
          <button
            aria-selected={demoMode === 'chat_v1'}
            className={`mercenary-toolbar__chip mercenary-toolbar__chip--inference${demoMode === 'chat_v1' ? ' mercenary-toolbar__chip--active' : ''}`}
            onClick={() => onDemoModeChange('chat_v1')}
            type="button"
          >
            {buildDemoModeChipLabel('chat_v1')}
          </button>
        </div>
      </div>

      <div aria-label="Mercenary controls" className="mercenary-toolbar" role="toolbar">
        {balanceLabel ? <span className="mercenary-chat__balance">{balanceLabel}</span> : null}
        {hasConversation ? (
          <button
            className="mercenary-toolbar__action button"
            disabled={isLaunching}
            onClick={onResetConversation}
            type="button"
          >
            new chat
          </button>
        ) : null}
      </div>
    </header>
  );
}
