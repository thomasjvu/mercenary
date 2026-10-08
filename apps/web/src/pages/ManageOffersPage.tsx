import { ManageOfferCard } from '../components/seller/ManageOfferCard.js';
import { PageIntro } from '../components/system/PageIntro.js';
import { WalletGate } from '../components/system/WalletGate.js';
import { useManageOffers } from '../hooks/useManageOffers.js';

export function ManageOffersPage() {
  const state = useManageOffers();

  return (
    <section className="page-shell page-flat">
      <PageIntro title="Manage my offers" />

      <WalletGate />

      {state.isAuthenticated ? (
        <div className="manage-offers">
          {state.workerOffers.length === 0 ? (
            <article className="page-panel">
              <p>No worker offers. Register an agent worker to provide raid services.</p>
              <a className="button" href="/onboarding/seller/http">
                Register worker
              </a>
            </article>
          ) : (
            state.workerOffers.map((provider) => (
              <ManageOfferCard key={provider.providerId} provider={provider} state={state} />
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
