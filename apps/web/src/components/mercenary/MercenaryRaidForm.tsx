import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { shouldLaunchOnComposerKey } from '../../lib/mercenary-composer.js';

type MercenaryRaidFormProps = {
  raidBrief: string;
  hasConversation: boolean;
  promptSuggestions: readonly string[];
  canSendBrief: boolean;
  isLaunching: boolean;
  onBriefChange: (value: string) => void;
  onLaunch: () => void;
};

export function MercenaryRaidForm({
  raidBrief,
  hasConversation,
  promptSuggestions,
  canSendBrief,
  isLaunching,
  onBriefChange,
  onLaunch,
}: MercenaryRaidFormProps) {
  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldLaunchOnComposerKey(event.key, event.shiftKey)) {
      return;
    }

    event.preventDefault();
    onLaunch();
  }

  return (
    <div className="mercenary-composer">
      {!hasConversation ? (
        <div className="mercenary-composer__suggestions">
          {promptSuggestions.map((prompt) => (
            <button
              className={`mercenary-suggestion ${raidBrief === prompt ? 'mercenary-suggestion--active' : ''}`}
              key={prompt}
              onClick={() => onBriefChange(prompt)}
              type="button"
            >
              {prompt}
            </button>
          ))}
        </div>
      ) : null}

      <label className="mercenary-composer__field">
        <textarea
          className="mercenary-composer__textarea"
          onChange={(event) => onBriefChange(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          placeholder="Message Mercenary..."
          spellCheck={false}
          value={raidBrief}
        />
      </label>

      <div className="mercenary-composer__footer">
        <p className="mercenary-composer__hint">Enter sends · Shift+Enter newline</p>
        <div className="mercenary-action-row">
          <button
            className="button button--primary"
            disabled={!canSendBrief}
            onClick={() => onLaunch()}
            type="button"
          >
            {isLaunching ? 'sending...' : 'send'}
          </button>
        </div>
      </div>
    </div>
  );
}
