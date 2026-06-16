import { useMemo } from 'react';
import { useSearchCombobox } from '../../hooks/useSearchCombobox.js';
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
  const { open, query, setQuery, rootRef, inputRef, handleSelect, openList, toggleList } =
    useSearchCombobox(onChange);

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
            openList();
          }}
          onFocus={openList}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              toggleList();
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
          onClick={toggleList}
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
