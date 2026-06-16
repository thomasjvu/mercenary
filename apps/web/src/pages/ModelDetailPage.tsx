import { EmptyState } from '../components/system/EmptyState.js';
import { ModelDetailBody } from '../components/marketplace/ModelDetailBody.js';
import { ModelDetailHero } from '../components/marketplace/ModelDetailHero.js';
import { useModelDetailPage } from '../hooks/useModelDetailPage.js';
import type { ProviderHealth } from '../api';

type ModelDetailPageProps = {
  modelId: string;
  providerHealth: ProviderHealth[];
  onBack: () => void;
  onTryModel: (modelId: string) => void;
};

export function ModelDetailPage({
  modelId,
  providerHealth,
  onBack,
  onTryModel,
}: ModelDetailPageProps) {
  const state = useModelDetailPage(modelId, providerHealth);

  return (
    <section className="page-shell model-detail-page">
      <ModelDetailHero modelId={modelId} onBack={onBack} onTryModel={onTryModel} state={state} />

      {state.markets.error ? (
        <EmptyState body={`Could not load market data for ${modelId}.`} title="unavailable" />
      ) : state.markets.isLoading ? (
        <EmptyState body="Reading seller order book..." title="loading" />
      ) : !state.market ? (
        <EmptyState
          body={`No eligible sellers are registered for ${modelId}.`}
          title="no sellers"
        />
      ) : (
        <ModelDetailBody modelId={modelId} state={state} />
      )}
    </section>
  );
}
