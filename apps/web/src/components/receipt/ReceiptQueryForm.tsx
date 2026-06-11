import { type FormEvent } from 'react';
import { buildAttestedRuntimeUrl } from '../../lib/receipt-url';

type ReceiptQueryFormProps = {
  raidIdInput: string;
  tokenInput: string;
  onRaidIdChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ReceiptQueryForm({
  raidIdInput,
  tokenInput,
  onRaidIdChange,
  onTokenChange,
  onSubmit,
}: ReceiptQueryFormProps) {
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
      <div className="receipt-form__actions">
        <button className="button button--primary" type="submit">
          load receipt
        </button>
        <a className="button" href={buildAttestedRuntimeUrl()} rel="noreferrer" target="_blank">
          runtime proof
        </a>
      </div>
    </form>
  );
}
