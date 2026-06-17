import type { ReceiptPageState } from '../../hooks/useReceiptPage.js';

type ReceiptLoadErrorProps = {
  state: ReceiptPageState;
  compact?: boolean;
};

export function ReceiptLoadError({ state, compact }: ReceiptLoadErrorProps) {
  const message = state.status.error?.message ?? state.result.error?.message;

  if (compact) {
    return (
      <div className="verification-alert verification-alert--error" role="alert">
        <p className="verification-alert__title">Receipt access was rejected.</p>
        <p>{message}</p>
      </div>
    );
  }

  return (
    <article className="receipt-empty receipt-empty--error receipt-empty--viewport">
      <p className="eyebrow">load failed</p>
      <h2>Receipt access was rejected.</h2>
      <p>{message}</p>
    </article>
  );
}
