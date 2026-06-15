import { useEffect, useMemo, useRef, useState } from 'react';
import { ProviderBrandIcon } from '../ProviderBrandIcon.js';
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
  const inputRef = useRef<HTMLInputElement | null>(null);

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
  }, [options, query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  function handleSelect(modelId: string) {
    onChange(modelId);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }

  return (
    <div className="model-combobox" ref={rootRef}>
      <div className="model-combobox__control">
        <input
          ref={inputRef}
          aria-autocomplete="list"
          aria-expanded={open}
          className="model-combobox__input"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
              setQuery('');
              inputRef.current?.blur();
            }
            if (event.key === 'Enter' && open) {
              const first = filtered[0]?.[1][0];
              if (first) {
                event.preventDefault();
                handleSelect(first.modelId);
              }
            }
          }}
          placeholder={
            selected
              ? `${selected.displayName} (${selected.modelId})`
              : (placeholder ?? 'Search models...')
          }
          role="combobox"
          spellCheck={false}
          value={open ? query : ''}
        />
        <button
          aria-label={open ? 'Close model list' : 'Open model list'}
          className="model-combobox__toggle"
          onClick={() => {
            if (open) {
              setOpen(false);
              setQuery('');
              inputRef.current?.blur();
              return;
            }
            setOpen(true);
            setQuery('');
            inputRef.current?.focus();
          }}
          type="button"
        >
          <span aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
      </div>

      {open ? (
        <div className="model-combobox__menu" role="listbox">
          <div className="model-combobox__list">
            {filtered.length === 0 ? (
              <p className="model-combobox__empty">No models match your search.</p>
            ) : (
              filtered.map(([groupLabel, groupOptions]) => (
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
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
