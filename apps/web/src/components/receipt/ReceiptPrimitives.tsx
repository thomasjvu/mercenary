export function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <article className="summary-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function ReceiptStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="receipt-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ReceiptDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="receipt-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
