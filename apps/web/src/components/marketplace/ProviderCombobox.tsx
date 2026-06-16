import { useMemo } from 'react';
import { SearchCombobox } from '../system/SearchCombobox.js';
import { ProviderBrandIcon } from '../ProviderBrandIcon.js';

export type ProviderComboboxOption = {
  id: string;
  label: string;
  count: number;
};

type ProviderComboboxProps = {
  options: ProviderComboboxOption[];
  value: string;
  onChange: (providerId: string) => void;
  placeholder?: string;
};

function buildFilteredProviderOptions(
  options: ProviderComboboxOption[],
  allCount: number,
  query: string
) {
  const normalized = query.trim().toLowerCase();
  return [{ id: '', label: 'all providers', count: allCount }, ...options].filter((option) => {
    if (!normalized) {
      return true;
    }
    return (
      option.label.toLowerCase().includes(normalized) ||
      option.id.toLowerCase().includes(normalized)
    );
  });
}

export function ProviderCombobox({ options, value, onChange, placeholder }: ProviderComboboxProps) {
  const allCount = useMemo(
    () => options.reduce((total, option) => total + option.count, 0),
    [options]
  );

  const selected =
    value === ''
      ? { id: '', label: 'all providers', count: allCount }
      : options.find((option) => option.id === value);

  return (
    <SearchCombobox
      ariaLabelClosed="Open provider list"
      ariaLabelOpen="Close provider list"
      closedPlaceholder={
        selected ? `${selected.label} (${selected.count})` : (placeholder ?? 'Search providers...')
      }
      onChange={onChange}
      onEnterSelect={(query) => buildFilteredProviderOptions(options, allCount, query)[0]?.id}
      placeholder={placeholder ?? 'Search providers...'}
      value={value}
    >
      {({ query, handleSelect }) => {
        const filtered = buildFilteredProviderOptions(options, allCount, query);

        if (filtered.length === 0) {
          return <p className="model-combobox__empty">No providers match your search.</p>;
        }

        return (
          <>
            {filtered.map((option) => (
              <button
                className={`model-combobox__option${option.id === value ? ' model-combobox__option--active' : ''}`}
                key={option.id || 'all'}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => handleSelect(option.id)}
                role="option"
                aria-selected={option.id === value}
                type="button"
              >
                <span className="model-combobox__option-main">
                  {option.id ? <ProviderBrandIcon modelProvider={option.id} size={16} /> : null}
                  <span>{option.label}</span>
                </span>
                <small>{option.count} models</small>
              </button>
            ))}
          </>
        );
      }}
    </SearchCombobox>
  );
}
