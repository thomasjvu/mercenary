import type { BuyerApiKeyCreateState } from '../../hooks/useBuyerApiKeyCreate.js';
import type { MercenaryPaymentKeyOption } from '../../hooks/useMercenaryPayment.js';

const MIN_KEY_BUDGET_USD = 1;
const MIN_RAID_BUDGET_USD = 1;

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
  onMaxBudgetUsdChange: (value: number) => void;
  keyCreate: BuyerApiKeyCreateState;
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
  onMaxBudgetUsdChange,
  keyCreate,
  isLaunching,
}: MercenaryPaymentPanelProps) {
  function handleRaidBudgetChange(rawValue: string) {
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed < MIN_RAID_BUDGET_USD) {
      onMaxBudgetUsdChange(MIN_RAID_BUDGET_USD);
      return;
    }
    onMaxBudgetUsdChange(parsed);
  }

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
              Secret missing for this key. Create a new key below or re-save from /account.
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
          min={MIN_RAID_BUDGET_USD}
          onChange={(event) => handleRaidBudgetChange(event.target.value)}
          step={1}
          type="number"
          value={maxBudgetUsd}
        />
      </div>

      {keyOptions.length === 0 ? (
        <div className="mercenary-run-panel__payment-create">
          <input
            className="mercenary-run-panel__budget-input"
            disabled={keyCreate.pending || isLaunching}
            onChange={(event) => keyCreate.setKeyName(event.target.value)}
            placeholder="Key name"
            type="text"
            value={keyCreate.keyName}
          />
          <input
            className="mercenary-run-panel__budget-input"
            disabled={keyCreate.pending || isLaunching}
            inputMode="decimal"
            min={MIN_KEY_BUDGET_USD}
            onChange={(event) => keyCreate.setSpendLimit(event.target.value)}
            step={1}
            type="number"
            value={keyCreate.spendLimit}
          />
          <button
            className="mercenary-run-panel__chip mercenary-run-panel__chip--button"
            disabled={keyCreate.pending || isLaunching}
            onClick={() => void keyCreate.createKey()}
            type="button"
          >
            {keyCreate.pending ? 'creating…' : 'create key'}
          </button>
          {keyCreate.keyError ? (
            <p className="mercenary-run-panel__payment-note">{keyCreate.keyError}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
