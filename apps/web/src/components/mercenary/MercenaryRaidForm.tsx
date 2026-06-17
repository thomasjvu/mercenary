import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { DEFAULT_MERCENARY_BUDGET_USD } from '../../mercenary-result.js';
import { shouldLaunchOnComposerKey } from '../../lib/mercenary-composer.js';

type MercenaryRaidFormProps = {
  raidBrief: string;
  maxBudgetUsd: number;
  hasConversation: boolean;
  promptSuggestions: readonly string[];
  canSendBrief: boolean;
  isLaunching: boolean;
  onBriefChange: (value: string) => void;
  onBudgetChange: (value: number) => void;
  onLaunch: () => void;
};

export function MercenaryRaidForm({
  raidBrief,
  maxBudgetUsd,
  hasConversation,
  promptSuggestions,
  canSendBrief,
  isLaunching,
  onBriefChange,
  onBudgetChange,
  onLaunch,
}: MercenaryRaidFormProps) {
  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldLaunchOnComposerKey(event.key, event.shiftKey)) {
      return;
    }

    event.preventDefault();
    onLaunch();
  }

  function handleBudgetChange(rawValue: string) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      onBudgetChange(DEFAULT_MERCENARY_BUDGET_USD);
      return;
    }

    onBudgetChange(parsed);
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
        <label className="mercenary-composer__budget">
          <span>Budget USD</span>
          <input
            className="mercenary-composer__budget-input"
            disabled={isLaunching}
            inputMode="decimal"
            min={1}
            onChange={(event) => handleBudgetChange(event.target.value)}
            step={1}
            type="number"
            value={maxBudgetUsd}
          />
        </label>
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
