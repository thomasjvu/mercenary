import type { AccountPageState } from '../../hooks/useAccountPage.js';

type AccountSellerPanelProps = {
  state: AccountPageState;
};

export function AccountSellerPanel({ state }: AccountSellerPanelProps) {
  const session = state.session.data;
  if (!session) {
    return null;
  }

  return (
    <>
      <article className="flow-card account-overview">
        <div className="flow-card__metric">
          <span>lifetime gross</span>
          <strong>${(state.sellerStats.data?.grossUsd ?? 0).toFixed(2)}</strong>
        </div>
        <div className="flow-card__metric">
          <span>24h earnings</span>
          <strong>${(state.sellerStats.data?.earnings24hUsd ?? 0).toFixed(2)}</strong>
        </div>
        <div className="flow-card__metric">
          <span>active offers</span>
          <strong>{String(state.sellerStats.data?.activeOffers ?? 0)}</strong>
        </div>
        <div className="flow-card__metric">
          <span>linked providers</span>
          <strong>{String(session.account?.sellerProviderIds.length ?? 0)}</strong>
        </div>
      </article>

      <article className="flow-card">
        <p className="eyebrow">offers</p>
        {state.sellerRows.length === 0 ? (
          <p className="quiet-note">No seller endpoints registered.</p>
        ) : (
          <div className="table-list seller-offer-list">
            {state.sellerRows.map((provider) => {
              const offerStatus = provider.marketplaceOfferStatus ?? 'active';

              return (
                <div className="table-row seller-offer-row" key={provider.providerId}>
                  <div className="seller-offer-row__meta">
                    <strong>{provider.displayName}</strong>
                    <span>{provider.modelId ?? 'model n/a'}</span>
                    <span>${provider.pricePerTaskUsd.toFixed(2)}</span>
                    <span className={`offer-status offer-status--${offerStatus}`}>
                      {offerStatus}
                    </span>
                  </div>
                  <div className="seller-offer-row__actions">
                    <button
                      className="button"
                      onClick={() => void state.toggleOffer(provider.providerId, offerStatus)}
                      type="button"
                    >
                      {offerStatus === 'paused' ? 'resume' : 'pause'}
                    </button>
                    <button
                      className="button"
                      onClick={() => void state.verifyProvider(provider.providerId)}
                      type="button"
                    >
                      verify
                    </button>
                  </div>
                  {state.sellerActionStatus[provider.providerId] ? (
                    <p className="form-status seller-offer-row__status">
                      {state.sellerActionStatus[provider.providerId]}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </article>
    </>
  );
}
