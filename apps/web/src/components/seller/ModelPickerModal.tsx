import { useMemo, useState } from 'react';
import type { UpstreamProviderId } from '@bossraid/constants';
import { UPSTREAM_PROVIDER_LABELS, type UpstreamCatalogModel } from '../../api/seller-upstream.js';

type ModelPickerModalProps = {
  models: UpstreamCatalogModel[];
  provider: UpstreamProviderId;
  selectedIds: string[];
  onClose: () => void;
  onConfirm: (modelIds: string[]) => void;
};

export function ModelPickerModal({
  models,
  provider,
  selectedIds,
  onClose,
  onConfirm,
}: ModelPickerModalProps) {
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState<Set<string>>(() => new Set(selectedIds));
  const [onlyUpstream, setOnlyUpstream] = useState(true);
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

  return (
    <div className="seller-modal" role="dialog" aria-modal="true" aria-label="Select models">
      <button
        className="seller-modal__backdrop"
        onClick={onClose}
        type="button"
        aria-label="Close"
      />
      <div className="seller-modal__panel">
        <header className="seller-modal__header">
          <div>
            <p className="eyebrow">{UPSTREAM_PROVIDER_LABELS[provider]} models</p>
            <h2>Select models to offer</h2>
            <p className="lede">
              {selection.size} selected · {filtered.length} visible · {models.length} supported
            </p>
          </div>
          <button className="button" onClick={onClose} type="button">
            close
          </button>
        </header>

        <div className="seller-modal__toolbar">
          <label className="field field--inline">
            <span>search</span>
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="claude, gemma, tee..."
              value={query}
            />
          </label>
          <label className="check-row">
            <input
              checked={onlyUpstream}
              onChange={(event) => setOnlyUpstream(event.target.checked)}
              type="checkbox"
            />
            only models on your account
          </label>
          <label className="check-row">
            <input
              checked={onlyTee}
              onChange={(event) => setOnlyTee(event.target.checked)}
              type="checkbox"
            />
            tee / e2ee only
          </label>
          <button className="button" onClick={selectVisible} type="button">
            select visible
          </button>
        </div>

        <div className="seller-model-grid">
          {filtered.map((model) => {
            const selected = selection.has(model.modelId);
            return (
              <button
                className={`seller-model-card${selected ? ' seller-model-card--selected' : ''}`}
                key={model.modelId}
                onClick={() => toggleModel(model.modelId)}
                type="button"
              >
                <span className="seller-model-card__title">{model.displayName}</span>
                <span className="seller-model-card__meta">{model.modelId}</span>
                <span className="seller-model-card__badges">
                  {model.teeAttested ? (
                    <span className="trust-badge trust-badge--tee">tee</span>
                  ) : null}
                  {model.e2ee ? <span className="trust-badge trust-badge--e2ee">e2ee</span> : null}
                </span>
                <span className="seller-model-card__meta">
                  {model.maxContextTokens
                    ? `${Math.round(model.maxContextTokens / 1000)}k ctx`
                    : 'ctx n/a'}
                </span>
                <span className="seller-model-card__rate">
                  ${model.referenceInputPer1mUsd?.toFixed(2) ?? '0.00'} / $
                  {model.referenceOutputPer1mUsd?.toFixed(2) ?? '0.00'} per M
                </span>
                {!model.upstreamFound ? (
                  <span className="seller-model-card__badge">not on account</span>
                ) : (
                  <span className="seller-model-card__badge seller-model-card__badge--ok">
                    on {provider}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <footer className="seller-modal__footer">
          <button className="button" onClick={onClose} type="button">
            cancel
          </button>
          <button
            className="button button--primary"
            disabled={selection.size === 0}
            onClick={() => onConfirm([...selection])}
            type="button"
          >
            use {selection.size} model{selection.size === 1 ? '' : 's'}
          </button>
        </footer>
      </div>
    </div>
  );
}
