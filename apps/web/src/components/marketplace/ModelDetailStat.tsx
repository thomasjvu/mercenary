type ModelDetailStatProps = {
  label: string;
  value: string;
};

export function ModelDetailStat({ label, value }: ModelDetailStatProps) {
  return (
    <div className="model-detail-page__stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
