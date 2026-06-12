import { type FormEvent } from 'react';
import { buildAttestedRuntimeUrl } from '../../lib/receipt-url';

type ReceiptQueryFormProps = {
  raidIdInput: string;
  tokenInput: string;
  formError?: string | null;
  onRaidIdChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ReceiptQueryForm({
  raidIdInput,
  tokenInput,
  formError,
  onRaidIdChange,
  onTokenChange,
  onSubmit,
}: ReceiptQueryFormProps) {
  const canSubmit = raidIdInput.trim().length > 0 && tokenInput.trim().length > 0;

  return (
    <form className="receipt-form" onSubmit={onSubmit}>
      <label className="receipt-field">
        <span>raid id</span>
        <input
          className="receipt-field__input"
          onChange={(event) => onRaidIdChange(event.target.value)}
          placeholder="raid_..."
          spellCheck={false}
          type="text"
          value={raidIdInput}
        />
      </label>
      <label className="receipt-field">
        <span>raid access token</span>
        <input
          className="receipt-field__input"
          onChange={(event) => onTokenChange(event.target.value)}
          placeholder="paste raidAccessToken"
          spellCheck={false}
          type="text"
          value={tokenInput}
        />
      </label>
      {formError ? <p className="form-status form-status--error">{formError}</p> : null}
      <div className="receipt-form__actions">
        <button className="button button--primary" disabled={!canSubmit} type="submit">
          load receipt
        </button>
        <a className="button" href={buildAttestedRuntimeUrl()} rel="noreferrer" target="_blank">
          runtime proof
        </a>
      </div>
    </form>
  );
}
