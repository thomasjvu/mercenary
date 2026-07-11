import type { Provider } from '../../api/client.js';
import { formatHostedOfferPricing, resolveHostedOfferUpstream } from '../../lib/seller-offers.js';
import { FormStatus } from '../system/FormField.js';
import { UpstreamTeeVerificationPanel } from '../trust/UpstreamTeeVerificationPanel.js';
import type { ManageOffersState } from '../../hooks/useManageOffers.js';

type ManageOfferCardProps = {
  provider: Provider;
  state: ManageOffersState;
};

function resolveOfferLaneBadge(provider: Provider): { label: string; tone: 'chat' | 'harness' } {
  if (
    provider.source?.type === 'harness_hosted' ||
    provider.harnessProfile?.lane === 'agent_harness'
  ) {
    return { label: 'harness', tone: 'harness' };
  }
  return { label: 'chat', tone: 'chat' };
}

export function ManageOfferCard({ provider, state }: ManageOfferCardProps) {
  const upstream = resolveHostedOfferUpstream(provider.source, provider.modelProvider);
  const offerStatus = provider.marketplaceOfferStatus ?? 'active';
  const lane = resolveOfferLaneBadge(provider);

  return (
    <article className="page-panel manage-offers__card">
      <div className="manage-offers__main">
        <div className="manage-offers__title-row">
          <h2>{provider.displayName}</h2>
          <span className={`manage-offers__lane manage-offers__lane--${lane.tone}`}>
            {lane.label}
          </span>
        </div>
        <p className="manage-offers__meta">
          {provider.modelId} · {provider.modelProvider ?? upstream}
          {provider.agentFramework ? ` · ${provider.agentFramework}` : ''}
        </p>
        <p className="manage-offers__meta">{formatHostedOfferPricing(provider)}</p>
        <p className="manage-offers__meta">
          status {provider.verification?.status ?? 'pending'} · offer {offerStatus}
          {provider.harnessProfile?.installation
            ? ` · ${provider.harnessProfile.installation}`
            : ''}
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
