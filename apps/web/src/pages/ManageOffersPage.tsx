import { ManageOfferCard } from '../components/seller/ManageOfferCard.js';
import { PageIntro } from '../components/system/PageIntro.js';
import { WalletGate } from '../components/system/WalletGate.js';
import { useManageOffers } from '../hooks/useManageOffers.js';

export function ManageOffersPage() {
  const state = useManageOffers();

  return (
    <section className="beta-page page-flat">
      <PageIntro title="Manage my offers" />

      <WalletGate />

      {state.isAuthenticated ? (
        <div className="manage-offers">
          {state.hostedOffers.length === 0 ? (
            <article className="beta-panel">
              <p>No hosted offers yet. Create one from the sell wizard.</p>
            </article>
          ) : (
            state.hostedOffers.map((provider) => (
              <ManageOfferCard key={provider.providerId} provider={provider} state={state} />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
