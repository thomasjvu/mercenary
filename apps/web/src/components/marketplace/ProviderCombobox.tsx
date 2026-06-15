import { useEffect, useMemo, useRef, useState } from 'react';
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

export function ProviderCombobox({ options, value, onChange, placeholder }: ProviderComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const allCount = useMemo(
    () => options.reduce((total, option) => total + option.count, 0),
    [options]
  );

  const selected =
    value === ''
      ? { id: '', label: 'all providers', count: allCount }
      : options.find((option) => option.id === value);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const rows = [{ id: '', label: 'all providers', count: allCount }, ...options].filter(
      (option) => {
        if (!normalized) {
          return true;
        }
        return (
          option.label.toLowerCase().includes(normalized) ||
          option.id.toLowerCase().includes(normalized)
        );
      }
    );
    return rows;
  }, [allCount, options, query]);

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

  function handleSelect(providerId: string) {
    onChange(providerId);
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
            if (event.key === 'Enter' && open && filtered[0]) {
              event.preventDefault();
              handleSelect(filtered[0].id);
            }
          }}
          placeholder={
            selected
              ? `${selected.label} (${selected.count})`
              : (placeholder ?? 'Search providers...')
          }
          role="combobox"
          spellCheck={false}
          value={open ? query : ''}
        />
        <button
          aria-label={open ? 'Close provider list' : 'Open provider list'}
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
              <p className="model-combobox__empty">No providers match your search.</p>
            ) : (
              filtered.map((option) => (
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
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
