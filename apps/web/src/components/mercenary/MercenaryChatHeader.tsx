type MercenaryChatHeaderProps = {
  balanceUsd?: number;
  isAuthenticated: boolean;
  hasConversation: boolean;
  isLaunching: boolean;
  onResetConversation: () => void;
};

export function MercenaryChatHeader({
  balanceUsd,
  isAuthenticated,
  hasConversation,
  isLaunching,
  onResetConversation,
}: MercenaryChatHeaderProps) {
  const balanceLabel = isAuthenticated ? `$${(balanceUsd ?? 0).toFixed(2)} credit` : null;

  return (
    <header className="mercenary-chat__header">
      <div className="mercenary-chat__header-main">
        <strong className="mercenary-chat__title">Mercenary</strong>
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
