import type { ReceiptPageState } from '../../hooks/useReceiptPage.js';

type ReceiptLoadErrorProps = {
  state: ReceiptPageState;
};

export function ReceiptLoadError({ state }: ReceiptLoadErrorProps) {
  return (
    <article className="receipt-empty receipt-empty--error receipt-empty--viewport">
      <p className="eyebrow">load failed</p>
      <h2>Receipt access was rejected.</h2>
      <p>{state.status.error?.message ?? state.result.error?.message}</p>
    </article>
  );
}
