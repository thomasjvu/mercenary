type FilterFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  inputMode?: 'decimal' | 'text';
  compact?: boolean;
  className?: string;
};

export function FilterField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  compact = false,
  className,
}: FilterFieldProps) {
  const fieldClass =
    className ?? `market-filters__field${compact ? ' market-filters__field--compact' : ''}`;

  return (
    <label className={fieldClass}>
      <span>{label}</span>
      <input
        inputMode={inputMode}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </label>
  );
}
