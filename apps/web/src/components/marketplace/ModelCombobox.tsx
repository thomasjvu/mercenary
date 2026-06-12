import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveProviderBrand } from '../../lib/provider-brand.js';

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

export function ModelCombobox({ options, value, onChange, placeholder }: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selected = options.find((option) => option.modelId === value);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows = options.filter((option) => {
      if (!normalized) {
        return true;
      }
      return (
        option.modelId.toLowerCase().includes(normalized) ||
        option.displayName.toLowerCase().includes(normalized) ||
        option.modelProvider.toLowerCase().includes(normalized)
      );
    });
    const groups = new Map<string, ModelComboboxOption[]>();
    for (const option of rows) {
      const label = groupLabelForProvider(option.modelProvider);
      groups.set(label, [...(groups.get(label) ?? []), option]);
    }
    return [...groups.entries()];
  }, [options, query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  return (
    <div className="model-combobox" ref={rootRef}>
      <button
        className="model-combobox__trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>
          {selected
            ? `${selected.displayName}${selected.liveSellers > 0 ? '' : ' · catalog'}`
            : (placeholder ?? 'Select model')}
        </span>
        <span aria-hidden="true">▾</span>
      </button>

      {open ? (
        <div className="model-combobox__menu">
          <input
            autoFocus
            className="model-combobox__search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search models..."
            value={query}
          />
          <div className="model-combobox__list">
            {filtered.map(([groupLabel, groupOptions]) => (
              <div className="model-combobox__group" key={groupLabel}>
                <p className="model-combobox__group-label">{groupLabel}</p>
                {groupOptions.map((option) => (
                  <button
                    className={`model-combobox__option${option.modelId === value ? ' model-combobox__option--active' : ''}`}
                    key={option.modelId}
                    onClick={() => {
                      onChange(option.modelId);
                      setOpen(false);
                      setQuery('');
                    }}
                    type="button"
                  >
                    <span>{option.displayName}</span>
                    <small>
                      {option.liveSellers > 0 ? `${option.liveSellers} live` : 'catalog'}
                      {option.referenceRateUsd != null
                        ? ` · $${option.referenceRateUsd.toFixed(3)}`
                        : ''}
                    </small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
