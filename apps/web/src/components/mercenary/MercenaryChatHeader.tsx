import type { MercenaryRequestMode } from '../../mercenary-result.js';
import { buildRequestModeChipLabel } from '../../mercenary-result.js';

type MercenaryChatHeaderProps = {
  requestMode: MercenaryRequestMode;
  balanceUsd?: number;
  isAuthenticated: boolean;
  hasConversation: boolean;
  isLaunching: boolean;
  onRequestModeChange: (mode: MercenaryRequestMode) => void;
  onResetConversation: () => void;
};

export function MercenaryChatHeader({
  requestMode,
  balanceUsd,
  isAuthenticated,
  hasConversation,
  isLaunching,
  onRequestModeChange,
  onResetConversation,
}: MercenaryChatHeaderProps) {
  const balanceLabel = isAuthenticated ? `$${(balanceUsd ?? 0).toFixed(2)} credit` : null;

  return (
    <header className="mercenary-chat__header">
      <div className="mercenary-chat__header-main">
        <strong className="mercenary-chat__title">Mercenary</strong>
        <div className="mercenary-toolbar__group" role="group" aria-label="Request lane">
          <button
            aria-selected={requestMode === 'raid'}
            className={`mercenary-toolbar__chip mercenary-toolbar__chip--raid${requestMode === 'raid' ? ' mercenary-toolbar__chip--active' : ''}`}
            onClick={() => onRequestModeChange('raid')}
            type="button"
          >
            {buildRequestModeChipLabel('raid')}
          </button>
          <button
            aria-selected={requestMode === 'chat_v1'}
            className={`mercenary-toolbar__chip mercenary-toolbar__chip--inference${requestMode === 'chat_v1' ? ' mercenary-toolbar__chip--active' : ''}`}
            onClick={() => onRequestModeChange('chat_v1')}
            type="button"
          >
            {buildRequestModeChipLabel('chat_v1')}
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
