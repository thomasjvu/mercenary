import { formatUsd } from '@bossraid/proof-ui';
import { ProviderBrandIcon } from '../ProviderBrandIcon.js';
import type { ModelDetailPageState } from '../../hooks/useModelDetailPage.js';

type ModelDetailHeroProps = {
  modelId: string;
  state: ModelDetailPageState;
  onBack: () => void;
  onTryModel: (modelId: string) => void;
};

export function ModelDetailHero({ modelId, state, onBack, onTryModel }: ModelDetailHeroProps) {
  const { market, savingsLabel } = state;

  return (
    <header className="model-detail-page__hero">
      <div className="model-detail-page__intro">
        <button className="model-detail-page__back" onClick={onBack} type="button">
          ← all models
        </button>
        <div className="model-detail-page__identity">
          <p className="eyebrow model-detail-page__provider">
            <ProviderBrandIcon modelProvider={market?.modelProvider} size={16} />
            {market?.modelProvider ?? 'model marketplace'}
          </p>
          <h1>{modelId}</h1>
        </div>
      </div>

      {market ? (
        <div className="model-detail-page__cta">
          <div className="model-detail-page__quote">
            <p className="model-detail-page__price-label">from</p>
            <p className="model-detail-page__price">{formatUsd(market.cheapestRateUsd)}</p>
            {savingsLabel ? <p className="model-detail-page__savings">{savingsLabel}</p> : null}
          </div>
          <button
            className="button button--primary info-panel__cta rx-spacebar-clip"
            onClick={() => onTryModel(modelId)}
            type="button"
          >
            try in playground
          </button>
        </div>
      ) : null}
    </header>
  );
}
