import type { Provider } from '../../api/client.js';
import { FormStatus } from '../system/FormField.js';
import type { ManageOffersState } from '../../hooks/useManageOffers.js';

type ManageOfferCardProps = {
  provider: Provider;
  state: ManageOffersState;
};

export function ManageOfferCard({ provider, state }: ManageOfferCardProps) {
  const offerStatus = provider.marketplaceOfferStatus ?? 'active';

  return (
    <article className="page-panel manage-offers__card">
      <div className="manage-offers__main">
        <div className="manage-offers__title-row">
          <h2>{provider.displayName}</h2>
        </div>
        <p className="manage-offers__meta">
          {provider.modelId} · {provider.modelProvider ?? 'custom'}
          {provider.agentFramework ? ` · ${provider.agentFramework}` : ''}
        </p>
        <p className="manage-offers__meta">${provider.pricePerTaskUsd.toFixed(2)} per task</p>
        <p className="manage-offers__meta">
          status {provider.verification?.status ?? 'pending'} · offer {offerStatus}
          {provider.harnessProfile?.installation
            ? ` · ${provider.harnessProfile.installation}`
            : ''}
        </p>
      </div>
      <div className="manage-offers__actions">
        <button
          className="button"
          onClick={() => void state.toggleOffer(provider.providerId, offerStatus)}
          type="button"
        >
          {offerStatus === 'paused' ? 'resume' : 'pause'}
        </button>
        <button
          className="button"
          onClick={() => void state.verifyOffer(provider.providerId)}
          type="button"
        >
          re-verify
        </button>
        {state.actionStatus[provider.providerId] ? (
          <FormStatus>{state.actionStatus[provider.providerId]}</FormStatus>
        ) : null}
      </div>
    </article>
  );
}
