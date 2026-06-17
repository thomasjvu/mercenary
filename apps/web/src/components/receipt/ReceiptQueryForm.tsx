import { type FormEvent } from 'react';
import { FormField, FormStatus } from '../system/FormField.js';

type ReceiptQueryFormProps = {
  raidIdInput: string;
  tokenInput: string;
  formError?: string | null;
  onRaidIdChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  compact?: boolean;
  terminal?: boolean;
};

export function ReceiptQueryForm({
  raidIdInput,
  tokenInput,
  formError,
  onRaidIdChange,
  onTokenChange,
  onSubmit,
  compact,
  terminal,
}: ReceiptQueryFormProps) {
  const canSubmit = raidIdInput.trim().length > 0 && tokenInput.trim().length > 0;
  const formClassName = [
    'receipt-form',
    compact ? 'receipt-form--compact' : '',
    terminal ? 'receipt-form--terminal' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <form className={formClassName} onSubmit={onSubmit}>
      <FormField className="receipt-field" label="raid id">
        <input
          className="receipt-field__input"
          onChange={(event) => onRaidIdChange(event.target.value)}
          placeholder="raid_..."
          spellCheck={false}
          type="text"
          value={raidIdInput}
        />
      </FormField>
      <FormField className="receipt-field" label="raid access token">
        <input
          className="receipt-field__input"
          onChange={(event) => onTokenChange(event.target.value)}
          placeholder="paste raidAccessToken"
          spellCheck={false}
          type="text"
          value={tokenInput}
        />
      </FormField>
      {formError ? <FormStatus tone="error">{formError}</FormStatus> : null}
      <div className="receipt-form__actions">
        <button
          className={`button button--primary${terminal ? ' rx-spacebar-clip' : ''}`}
          disabled={!canSubmit}
          type="submit"
        >
          load receipt
        </button>
      </div>
    </form>
  );
}
