import type { Provider } from '../../api/client.js';
import { formatHostedOfferPricing, resolveHostedOfferUpstream } from '../../lib/seller-offers.js';
import { FormStatus } from '../system/FormField.js';
import { UpstreamTeeVerificationPanel } from '../trust/UpstreamTeeVerificationPanel.js';
import type { ManageOffersState } from '../../hooks/useManageOffers.js';

type ManageOfferCardProps = {
  provider: Provider;
  state: ManageOffersState;
};

export function ManageOfferCard({ provider, state }: ManageOfferCardProps) {
  const upstream = resolveHostedOfferUpstream(provider.source, provider.modelProvider);
  const offerStatus = provider.marketplaceOfferStatus ?? 'active';

  return (
    <article className="beta-panel manage-offers__card">
      <div className="manage-offers__main">
        <h2>{provider.displayName}</h2>
        <p className="manage-offers__meta">
          {provider.modelId} · {provider.modelProvider ?? upstream}
        </p>
        <p className="manage-offers__meta">{formatHostedOfferPricing(provider)}</p>
        <p className="manage-offers__meta">
          status {provider.verification?.status ?? 'pending'} · offer {offerStatus}
        </p>
        {provider.privacy?.teeAttested || provider.privacy?.e2ee ? (
          <UpstreamTeeVerificationPanel
            compact
            e2ee={provider.privacy?.e2ee}
            modelId={provider.modelId ?? ''}
            provider={upstream}
            sellerId={provider.providerId}
            teeAttested={provider.privacy?.teeAttested}
          />
        ) : null}
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
        <button
          className="button"
          onClick={() => void state.removeOffer(provider.modelId, provider.providerId, upstream)}
          type="button"
        >
          remove
        </button>
        {state.actionStatus[provider.providerId] ? (
          <FormStatus>{state.actionStatus[provider.providerId]}</FormStatus>
        ) : null}
      </div>
    </article>
  );
}
