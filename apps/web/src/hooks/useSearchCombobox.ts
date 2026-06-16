import { useEffect, useRef, useState } from 'react';

export function useSearchCombobox(onChange: (value: string) => void) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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

  function handleSelect(value: string) {
    onChange(value);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }

  function openList() {
    setOpen(true);
    setQuery('');
  }

  function closeList() {
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  }

  function toggleList() {
    if (open) {
      closeList();
      return;
    }

    openList();
    inputRef.current?.focus();
  }

  return {
    open,
    query,
    setQuery,
    setOpen,
    rootRef,
    inputRef,
    handleSelect,
    openList,
    closeList,
    toggleList,
  };
}
