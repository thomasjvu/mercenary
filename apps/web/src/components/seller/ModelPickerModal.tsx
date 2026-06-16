import type { UpstreamProviderId } from '@bossraid/constants';
import { upstreamProviderLabel, type UpstreamCatalogModel } from '../../api/seller-upstream.js';
import { useModelPickerModal } from '../../hooks/useModelPickerModal.js';
import { FormInput } from '../system/FormField.js';

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
  const picker = useModelPickerModal({ models, selectedIds });

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
            <p className="eyebrow">{upstreamProviderLabel(provider)} models</p>
            <h2>Select models to offer</h2>
            <p className="lede">
              {picker.selection.size} selected · {picker.filtered.length} visible · {models.length}{' '}
              supported
            </p>
          </div>
          <button className="button" onClick={onClose} type="button">
            close
          </button>
        </header>

        <div className="seller-modal__toolbar">
          <FormInput
            className="field field--inline"
            label="search"
            onChange={(event) => picker.setQuery(event.target.value)}
            placeholder="claude, gemma, tee..."
            value={picker.query}
          />
          <label className="check-row">
            <input
              checked={picker.onlyUpstream}
              onChange={(event) => picker.setOnlyUpstream(event.target.checked)}
              type="checkbox"
            />
            only models on your account
          </label>
          <label className="check-row">
            <input
              checked={picker.onlyTee}
              onChange={(event) => picker.setOnlyTee(event.target.checked)}
              type="checkbox"
            />
            tee / e2ee only
          </label>
          <button className="button" onClick={picker.selectVisible} type="button">
            select visible
          </button>
        </div>

        <div className="seller-model-grid">
          {picker.filtered.map((model) => {
            const selected = picker.selection.has(model.modelId);
            return (
              <button
                className={`seller-model-card${selected ? ' seller-model-card--selected' : ''}`}
                key={model.modelId}
                onClick={() => picker.toggleModel(model.modelId)}
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
            disabled={picker.selection.size === 0}
            onClick={() => onConfirm([...picker.selection])}
            type="button"
          >
            use {picker.selection.size} model{picker.selection.size === 1 ? '' : 's'}
          </button>
        </footer>
      </div>
    </div>
  );
}
