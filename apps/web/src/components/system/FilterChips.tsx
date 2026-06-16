type FilterChipOption<T extends string> = {
  value: T;
  label: string;
};

type FilterChipsProps<T extends string> = {
  options: Array<FilterChipOption<T>>;
  value: T;
  onChange: (value: T) => void;
  chipClassName?: string;
  activeClassName?: string;
  groupClassName?: string;
  groupLabelClassName?: string;
  chipsClassName?: string;
  groupLabel?: string;
  ariaLabel?: string;
};

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  chipClassName = 'market-filters__chip',
  activeClassName = 'market-filters__chip--active',
  groupClassName = 'market-filters__group',
  groupLabelClassName = 'market-filters__group-label',
  chipsClassName = 'market-filters__chips',
  groupLabel,
  ariaLabel = 'Filter',
}: FilterChipsProps<T>) {
  return (
    <div className={groupClassName}>
      {groupLabel ? <span className={groupLabelClassName}>{groupLabel}</span> : null}
      <div aria-label={ariaLabel} className={chipsClassName} role="group">
        {options.map((option) => (
          <button
            aria-pressed={value === option.value}
            className={`${chipClassName}${value === option.value ? ` ${activeClassName}` : ''}`}
            key={option.value}
            onClick={() => onChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
