import { useEffect, useId, useState } from 'react';

export type OpsConfirmSeverity = 'warning' | 'danger';

type OpsConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  severity?: OpsConfirmSeverity;
  pending?: boolean;
  error?: string | null;
  requireTypedPhrase?: string;
  details?: string[];
  onConfirm: () => void;
  onCancel: () => void;
};

export function OpsConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'cancel',
  severity = 'warning',
  pending = false,
  error,
  requireTypedPhrase,
  details,
  onConfirm,
  onCancel,
}: OpsConfirmDialogProps) {
  const titleId = useId();
  const descriptionId = useId();
  const [typedPhrase, setTypedPhrase] = useState('');

  useEffect(() => {
    if (!open) {
      setTypedPhrase('');
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !pending) {
        onCancel();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onCancel, pending]);

  if (!open) {
    return null;
  }

  const phraseMatches =
    !requireTypedPhrase || typedPhrase.trim().toUpperCase() === requireTypedPhrase.toUpperCase();

  return (
    <div
      className="ops-confirm-backdrop"
      onClick={pending ? undefined : onCancel}
      role="presentation"
    >
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className={`ops-confirm-dialog ops-confirm-dialog--${severity}`}
        onClick={(event) => event.stopPropagation()}
        role="alertdialog"
      >
        <div className="ops-confirm-dialog__head">
          <p className="eyebrow">
            {severity === 'danger' ? 'confirm destructive action' : 'confirm action'}
          </p>
          <h2 id={titleId}>{title}</h2>
        </div>

        <p className="ops-confirm-dialog__description" id={descriptionId}>
          {description}
        </p>

        {details && details.length > 0 ? (
          <ul className="ops-confirm-dialog__details">
            {details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}

        {requireTypedPhrase ? (
          <label className="ops-confirm-dialog__typed">
            <span>Type {requireTypedPhrase} to confirm</span>
            <input
              autoComplete="off"
              disabled={pending}
              spellCheck={false}
              value={typedPhrase}
              onChange={(event) => setTypedPhrase(event.target.value)}
            />
          </label>
        ) : null}

        {error ? <p className="error-note">{error}</p> : null}

        <div className="ops-confirm-dialog__actions">
          <button className="button" disabled={pending} onClick={onCancel} type="button">
            {cancelLabel}
          </button>
          <button
            className={`button ${severity === 'danger' ? 'button--danger' : 'button--primary'}`}
            disabled={pending || !phraseMatches}
            onClick={onConfirm}
            type="button"
          >
            {pending ? 'working' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
