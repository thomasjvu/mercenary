import { compactText, type ReceiptProviderRowData } from '../../lib/receipt-helpers';

function ReceiptProviderRow({ row }: { row: ReceiptProviderRowData }) {
  return (
    <div className="receipt-provider-row">
      <div className="receipt-provider-row__head">
        <strong>{row.displayName}</strong>
        <span className="receipt-provider-row__state">{row.state}</span>
      </div>
      <p>{compactText(row.assignment, 84)}</p>
      <small>
        {compactText([row.proof, row.reason].filter((value) => value.length > 0).join(' · '), 120)}
      </small>
    </div>
  );
}

type ReceiptProviderListProps = {
  rows: ReceiptProviderRowData[];
};

export function ReceiptProviderList({ rows }: ReceiptProviderListProps) {
  return (
    <article className="receipt-surface">
      <div className="receipt-surface__head">
        <div>
          <p className="eyebrow">queued verified agents</p>
          <h2>Providers</h2>
        </div>
      </div>
      <div className="receipt-provider-list">
        {rows.length ? (
          rows.map((row) => <ReceiptProviderRow key={row.providerId} row={row} />)
        ) : (
          <p className="receipt-panel__muted">No routed queued agents recorded yet.</p>
        )}
      </div>
    </article>
  );
}
