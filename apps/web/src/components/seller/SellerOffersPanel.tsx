import type { AppRoute } from '../../lib/app-routes.js';
import type { SellerUpstreamOnboardingState } from '../../hooks/useSellerUpstreamOnboarding.js';

type SellerOffersPanelProps = {
  state: Pick<SellerUpstreamOnboardingState, 'isAuthenticated' | 'activeOffers'>;
  onNavigate: (path: AppRoute) => void;
};

export function SellerOffersPanel({ state, onNavigate }: SellerOffersPanelProps) {
  const { isAuthenticated, activeOffers } = state;

  return (
    <article className="sell-panel sell-panel--offers">
      <div className="sell-panel__head-row">
        <p className="sell-panel__eyebrow">view and edit offers</p>
        {activeOffers && activeOffers.length > 0 ? (
          <button
            className="button button--ghost"
            onClick={() => onNavigate('/sell/offers')}
            type="button"
          >
            manage all
          </button>
        ) : null}
      </div>

      {!isAuthenticated ? (
        <div className="sell-empty">
          <strong>Sign in to view offers</strong>
          <p>Connect wallet and create an offer above to start earning.</p>
        </div>
      ) : activeOffers && activeOffers.length > 0 ? (
        <div className="sell-offer-table">
          {activeOffers.map((offer) => (
            <div className="sell-offer-table__row" key={offer.providerId}>
              <div>
                <strong>{offer.displayName}</strong>
                <span>{offer.modelId}</span>
              </div>
              <span className={`offer-status offer-status--${offer.marketplaceOfferStatus}`}>
                {offer.marketplaceOfferStatus}
              </span>
              <span>{offer.verificationStatus ?? 'pending'}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="sell-empty">
          <strong>No active offers yet</strong>
          <p>Connect upstream, pick models, and publish above to start earning.</p>
        </div>
      )}
    </article>
  );
}
