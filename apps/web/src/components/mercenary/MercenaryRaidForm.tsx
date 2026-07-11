import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { shouldLaunchOnComposerKey } from '../../lib/mercenary-composer.js';
import {
  formatMercenaryBudgetCap,
  MIN_MERCENARY_BUDGET_USD,
  resolveMercenaryBudgetUsd,
} from '../../lib/mercenary-budget.js';

type MercenaryRaidFormProps = {
  raidBrief: string;
  maxBudgetUsd: number;
  hostMaxBudgetUsd?: number;
  balanceUsd?: number;
  isAuthenticated: boolean;
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
  hostMaxBudgetUsd,
  balanceUsd,
  isAuthenticated,
  hasConversation,
  promptSuggestions,
  canSendBrief,
  isLaunching,
  onBriefChange,
  onBudgetChange,
  onLaunch,
}: MercenaryRaidFormProps) {
  const balanceLabel = isAuthenticated ? `$${(balanceUsd ?? 0).toFixed(2)} credit` : null;
  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (!shouldLaunchOnComposerKey(event.key, event.shiftKey)) {
      return;
    }

    event.preventDefault();
    onLaunch();
  }

  function handleBudgetChange(rawValue: string) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < MIN_MERCENARY_BUDGET_USD) {
      onBudgetChange(resolveMercenaryBudgetUsd(undefined, hostMaxBudgetUsd));
      return;
    }

    onBudgetChange(parsed);
  }

  const budgetCapHint =
    hostMaxBudgetUsd != null ? formatMercenaryBudgetCap(hostMaxBudgetUsd) : null;

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
        <div className="mercenary-composer__footer-start">
          <label className="mercenary-composer__budget">
            <span>Budget USD</span>
            <input
              className="mercenary-composer__budget-input"
              disabled={isLaunching}
              inputMode="decimal"
              max={hostMaxBudgetUsd}
              min={MIN_MERCENARY_BUDGET_USD}
              onChange={(event) => handleBudgetChange(event.target.value)}
              step={1}
              type="number"
              value={maxBudgetUsd}
            />
          </label>
          {budgetCapHint ? (
            <span className="mercenary-composer__budget-cap">{budgetCapHint}</span>
          ) : null}
          {balanceLabel ? <span className="mercenary-composer__credit">{balanceLabel}</span> : null}
        </div>
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
