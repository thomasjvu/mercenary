type FilterSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
};

export function FilterSelect({
  label,
  value,
  onChange,
  options,
  compact = false,
  className,
  disabled = false,
}: FilterSelectProps) {
  const fieldClass =
    className ?? `market-filters__field${compact ? ' market-filters__field--compact' : ''}`;

  return (
    <label className={fieldClass}>
      <span>{label}</span>
      <select disabled={disabled} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue || 'any'} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}
