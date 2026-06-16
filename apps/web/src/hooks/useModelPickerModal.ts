import { useMemo, useState } from 'react';
import type { UpstreamCatalogModel } from '../api/seller-upstream.js';

type UseModelPickerModalOptions = {
  models: UpstreamCatalogModel[];
  selectedIds: string[];
};

export function useModelPickerModal({ models, selectedIds }: UseModelPickerModalOptions) {
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Set<string>>(() => new Set(selectedIds));
  const [onlyUpstream, setOnlyUpstream] = useState(false);
  const [onlyTee, setOnlyTee] = useState(false);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return models.filter((model) => {
      if (onlyUpstream && !model.upstreamFound) {
        return false;
      }
      if (onlyTee && !model.teeAttested && !model.e2ee) {
        return false;
      }
      if (!normalized) {
        return true;
      }
      return (
        model.modelId.toLowerCase().includes(normalized) ||
        model.displayName.toLowerCase().includes(normalized)
      );
    });
  }, [models, onlyTee, onlyUpstream, query]);

  function toggleModel(modelId: string) {
    setSelection((current) => {
      const next = new Set(current);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  }

  function selectVisible() {
    setSelection((current) => {
      const next = new Set(current);
      for (const model of filtered) {
        next.add(model.modelId);
      }
      return next;
    });
  }

  return {
    query,
    setQuery,
    selection,
    onlyUpstream,
    setOnlyUpstream,
    onlyTee,
    setOnlyTee,
    filtered,
    toggleModel,
    selectVisible,
  };
}

export type ModelPickerModalState = ReturnType<typeof useModelPickerModal>;
