type FilterSearchProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  labelClassName?: string;
  inputClassName?: string;
};

export function FilterSearch({
  label = 'Search',
  value,
  onChange,
  placeholder,
  className = 'market-filters__search',
  labelClassName = 'market-filters__search-label',
  inputClassName,
}: FilterSearchProps) {
  return (
    <label className={className}>
      <span className={labelClassName}>{label}</span>
      <input
        className={inputClassName}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        type="search"
        value={value}
      />
    </label>
  );
}
