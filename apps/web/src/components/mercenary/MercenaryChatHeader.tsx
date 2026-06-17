type MercenaryChatHeaderProps = {
  hasConversation: boolean;
  isLaunching: boolean;
  onResetConversation: () => void;
};

export function MercenaryChatHeader({
  hasConversation,
  isLaunching,
  onResetConversation,
}: MercenaryChatHeaderProps) {
  return (
    <header className="mercenary-chat__header">
      <div className="mercenary-chat__header-main">
        <strong className="mercenary-chat__title">Mercenary</strong>
      </div>

      <div aria-label="Mercenary controls" className="mercenary-toolbar" role="toolbar">
        {hasConversation ? (
          <button
            className="button button--pill"
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
