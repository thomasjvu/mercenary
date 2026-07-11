import type { MouseEvent } from 'react';
import type { MercenaryPaymentKeyOption } from '../../hooks/useMercenaryPayment.js';
import { formatMercenaryBudgetCap, MIN_MERCENARY_BUDGET_USD } from '../../lib/mercenary-budget.js';

const MIN_KEY_BUDGET_USD = 1;

function openAccountSettings(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
  if (window.location.pathname === '/account') {
    return;
  }
  window.history.pushState({}, '', '/account');
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0 });
}

type MercenaryPaymentPanelProps = {
  paymentMode: 'wallet' | 'api_key';
  keyOptions: MercenaryPaymentKeyOption[];
  selectedApiKeyId: string;
  onSelectApiKey: (keyId: string) => void;
  selectedKey?: MercenaryPaymentKeyOption;
  spendLimitDraft: string;
  onSpendLimitDraftChange: (value: string) => void;
  onSaveSpendLimit: () => void;
  budgetStatus: string | null;
  budgetPending: boolean;
  maxBudgetUsd: number;
  hostMaxBudgetUsd?: number;
  onMaxBudgetUsdChange: (value: number) => void;
  isLaunching: boolean;
};

export function MercenaryPaymentPanel({
  paymentMode,
  keyOptions,
  selectedApiKeyId,
  onSelectApiKey,
  selectedKey,
  spendLimitDraft,
  onSpendLimitDraftChange,
  onSaveSpendLimit,
  budgetStatus,
  budgetPending,
  maxBudgetUsd,
  hostMaxBudgetUsd,
  onMaxBudgetUsdChange,
  isLaunching,
}: MercenaryPaymentPanelProps) {
  function handleRaidBudgetChange(rawValue: string) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < MIN_MERCENARY_BUDGET_USD) {
      onMaxBudgetUsdChange(MIN_MERCENARY_BUDGET_USD);
      return;
    }
    onMaxBudgetUsdChange(parsed);
  }

  const budgetCapHint =
    hostMaxBudgetUsd != null ? formatMercenaryBudgetCap(hostMaxBudgetUsd) : null;

  return (
    <div className="mercenary-run-panel__payment">
      <div className="mercenary-run-panel__payment-row">
        <span>api key</span>
        <select
          className="mercenary-run-panel__select"
          disabled={isLaunching}
          onChange={(event) => onSelectApiKey(event.target.value)}
          value={selectedApiKeyId}
        >
          <option value="">Wallet credit</option>
          {keyOptions.map((key) => (
            <option key={key.id} value={key.id}>
              {key.label} ({key.prefix}…)
            </option>
          ))}
        </select>
      </div>

      {paymentMode === 'api_key' && selectedKey ? (
        <>
          <div className="mercenary-run-panel__payment-row">
            <span>key budget</span>
            <div className="mercenary-run-panel__budget-field">
              <input
                className="mercenary-run-panel__budget-input"
                disabled={budgetPending || isLaunching}
                inputMode="decimal"
                min={MIN_KEY_BUDGET_USD}
                onChange={(event) => onSpendLimitDraftChange(event.target.value)}
                step={1}
                type="number"
                value={spendLimitDraft}
              />
              <button
                className="mercenary-run-panel__chip mercenary-run-panel__chip--button"
                disabled={budgetPending || isLaunching}
                onClick={() => void onSaveSpendLimit()}
                type="button"
              >
                {budgetPending ? 'saving…' : 'save'}
              </button>
            </div>
          </div>
          <p className="mercenary-run-panel__payment-meta">
            spent ${selectedKey.spentUsd.toFixed(2)}
            {selectedKey.spendLimitUsd != null
              ? ` / $${selectedKey.spendLimitUsd.toFixed(2)} cap`
              : ' · no cap'}
          </p>
          {!selectedKey.hasSecret ? (
            <p className="mercenary-run-panel__payment-note">
              Secret missing for this key.{' '}
              <a
                className="mercenary-run-panel__payment-link"
                href="/account"
                onClick={openAccountSettings}
              >
                Re-save from account settings
              </a>
              .
            </p>
          ) : null}
          {budgetStatus ? (
            <p className="mercenary-run-panel__payment-note">{budgetStatus}</p>
          ) : null}
        </>
      ) : (
        <p className="mercenary-run-panel__payment-meta">Wallet credit uses x402 when you send.</p>
      )}

      <div className="mercenary-run-panel__payment-row">
        <span>per raid</span>
        <input
          className="mercenary-run-panel__budget-input"
          disabled={isLaunching}
          inputMode="decimal"
          max={hostMaxBudgetUsd}
          min={MIN_MERCENARY_BUDGET_USD}
          onChange={(event) => handleRaidBudgetChange(event.target.value)}
          step={1}
          type="number"
          value={maxBudgetUsd}
        />
      </div>
      {budgetCapHint ? <p className="mercenary-run-panel__payment-meta">{budgetCapHint}</p> : null}

      <p className="mercenary-run-panel__payment-meta">
        <a
          className="mercenary-run-panel__payment-link"
          href="/account"
          onClick={openAccountSettings}
        >
          Create API keys in account settings
        </a>
      </p>
    </div>
  );
}
