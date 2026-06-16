import type { KeyboardEvent, ReactNode } from 'react';
import { useSearchCombobox } from '../../hooks/useSearchCombobox.js';

type SearchComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  closedPlaceholder?: string;
  ariaLabelOpen: string;
  ariaLabelClosed: string;
  onEnterSelect?: (query: string) => string | undefined;
  children: (context: {
    open: boolean;
    query: string;
    setQuery: (value: string) => void;
    handleSelect: (value: string) => void;
  }) => ReactNode;
};

export function SearchCombobox({
  value,
  onChange,
  placeholder,
  closedPlaceholder,
  ariaLabelOpen,
  ariaLabelClosed,
  onEnterSelect,
  children,
}: SearchComboboxProps) {
  const { open, query, setQuery, rootRef, inputRef, handleSelect, openList, toggleList } =
    useSearchCombobox(onChange);

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      toggleList();
    }
    if (event.key === 'Enter' && open) {
      const nextValue = onEnterSelect?.(query);
      if (nextValue != null) {
        event.preventDefault();
        handleSelect(nextValue);
      }
    }
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
            openList();
          }}
          onFocus={openList}
          onKeyDown={handleKeyDown}
          placeholder={open ? placeholder : (closedPlaceholder ?? placeholder)}
          role="combobox"
          spellCheck={false}
          value={open ? query : ''}
        />
        <button
          aria-label={open ? ariaLabelOpen : ariaLabelClosed}
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
            {children({ open, query, setQuery, handleSelect })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
