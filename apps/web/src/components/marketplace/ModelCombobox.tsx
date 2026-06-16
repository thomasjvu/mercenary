import { useMemo } from 'react';
import { resolveProviderBrand } from '../../lib/provider-brand.js';
import { SearchCombobox } from '../system/SearchCombobox.js';
import { ProviderBrandIcon } from '../ProviderBrandIcon.js';

export type ModelComboboxOption = {
  modelId: string;
  displayName: string;
  modelProvider: string;
  liveSellers: number;
  referenceRateUsd: number | null;
};

type ModelComboboxProps = {
  options: ModelComboboxOption[];
  value: string;
  onChange: (modelId: string) => void;
  placeholder?: string;
};

function groupLabelForProvider(modelProvider: string): string {
  if (modelProvider === 'venice') {
    return 'Venice';
  }
  if (modelProvider === 'redpill' || modelProvider === 'phala') {
    return 'RedPill / Phala';
  }
  return resolveProviderBrand(modelProvider).label;
}

function buildFilteredModelGroups(options: ModelComboboxOption[], query: string) {
  const normalized = query.trim().toLowerCase();
  const rows = options.filter((option) => {
    if (!normalized) {
      return true;
    }
    return (
      option.modelId.toLowerCase().includes(normalized) ||
      option.displayName.toLowerCase().includes(normalized) ||
      option.modelProvider.toLowerCase().includes(normalized) ||
      resolveProviderBrand(option.modelProvider).label.toLowerCase().includes(normalized)
    );
  });
  const groups = new Map<string, ModelComboboxOption[]>();
  for (const option of rows) {
    const label = groupLabelForProvider(option.modelProvider);
    groups.set(label, [...(groups.get(label) ?? []), option]);
  }
  return [...groups.entries()];
}

export function ModelCombobox({ options, value, onChange, placeholder }: ModelComboboxProps) {
  const selected = useMemo(
    () => options.find((option) => option.modelId === value),
    [options, value]
  );

  return (
    <SearchCombobox
      ariaLabelClosed="Open model list"
      ariaLabelOpen="Close model list"
      closedPlaceholder={
        selected
          ? `${selected.displayName} (${selected.modelId})`
          : (placeholder ?? 'Search models...')
      }
      onChange={onChange}
      onEnterSelect={(query) => buildFilteredModelGroups(options, query)[0]?.[1][0]?.modelId}
      placeholder={placeholder ?? 'Search models...'}
      value={value}
    >
      {({ query, handleSelect }) => {
        const filtered = buildFilteredModelGroups(options, query);

        if (filtered.length === 0) {
          return <p className="model-combobox__empty">No models match your search.</p>;
        }

        return (
          <>
            {filtered.map(([groupLabel, groupOptions]) => (
              <div className="model-combobox__group" key={groupLabel}>
                <p className="model-combobox__group-label">{groupLabel}</p>
                {groupOptions.map((option) => (
                  <button
                    className={`model-combobox__option${option.modelId === value ? ' model-combobox__option--active' : ''}`}
                    key={option.modelId}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => handleSelect(option.modelId)}
                    role="option"
                    aria-selected={option.modelId === value}
                    type="button"
                  >
                    <span className="model-combobox__option-main">
                      <ProviderBrandIcon modelProvider={option.modelProvider} size={16} />
                      <span>{option.displayName}</span>
                    </span>
                    <small>
                      {option.modelId}
                      {' · '}
                      {option.liveSellers > 0 ? `${option.liveSellers} live` : 'catalog'}
                      {option.referenceRateUsd != null
                        ? ` · $${option.referenceRateUsd.toFixed(3)}`
                        : ''}
                    </small>
                  </button>
                ))}
              </div>
            ))}
          </>
        );
      }}
    </SearchCombobox>
  );
}
