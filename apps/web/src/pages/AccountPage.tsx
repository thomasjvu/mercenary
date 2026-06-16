import type { AppRoute } from '../lib/app-routes.js';
import { FlowPanel, FlowTabs } from '../components/system/FlowTabs.js';
import { FormInput, FormStatus } from '../components/system/FormField.js';
import { PageIntro } from '../components/system/PageIntro.js';
import { ACCOUNT_TABS, useAccountPage } from '../hooks/useAccountPage.js';

type AccountPageProps = {
  onNavigate: (path: AppRoute) => void;
};

export function AccountPage({ onNavigate }: AccountPageProps) {
  const state = useAccountPage({ onNavigate });

  if (state.session.isLoading || !state.session.data?.authenticated) {
    return null;
  }

  return (
    <section className="beta-page page-flat flow-page">
      <PageIntro
        actions={
          <button className="button" onClick={() => void state.signOut()} type="button">
            sign out
          </button>
        }
        title="Account"
      />

      <>
        <FlowTabs
          activeId={state.activeTab}
          onChange={(id) => state.setActiveTab(id as (typeof ACCOUNT_TABS)[number]['id'])}
          tabs={ACCOUNT_TABS}
        />

        <FlowPanel active={state.activeTab === 'wallet'} id="account-wallet">
          <div className="account-overview">
            <article className="flow-card">
              <p className="eyebrow">balance</p>
              <p className="account-balance__amount">
                ${(state.session.data.account?.balanceUsd ?? 0).toFixed(2)}
              </p>
              <p className="quiet-note">{state.session.data.wallet}</p>
              {(state.session.data.account?.totalSavingsUsd ?? 0) > 0 ? (
                <p className="quiet-note">
                  ${state.session.data.account?.totalSavingsUsd?.toFixed(2)} benchmark savings
                </p>
              ) : null}
              <form
                className="account-balance-fund"
                onSubmit={(event) => {
                  event.preventDefault();
                  void state.topUpBalance();
                }}
              >
                <FormInput
                  inputMode="decimal"
                  label="top up usd"
                  min="0.01"
                  onChange={(event) => state.setFundAmount(event.target.value)}
                  step="0.01"
                  type="number"
                  value={state.fundAmount}
                />
                <button className="button button--primary" type="submit">
                  credit balance
                </button>
                {state.fundStatus ? <FormStatus>{state.fundStatus}</FormStatus> : null}
              </form>
            </article>

            <article className="flow-card">
              <p className="eyebrow">account subscription</p>
              <p className="quiet-note">
                Weekly MetaMask permission tops up prepaid credit for marketplace inference and
                raids.
              </p>
              <p className="quiet-note">{state.smartPay.status}</p>
              <div className="mercenary-action-row">
                <button
                  className="button"
                  disabled={state.smartPay.busy}
                  onClick={() => void state.smartPay.connectWallet()}
                  type="button"
                >
                  connect MetaMask
                </button>
                <button
                  className="button button--primary"
                  disabled={state.smartPay.busy}
                  onClick={() =>
                    void state.smartPay.grantSubscription().then(() => state.session.mutate())
                  }
                  type="button"
                >
                  subscribe & top up
                </button>
              </div>
              {state.smartPay.subscription ? (
                <>
                  <FormStatus>
                    ${state.smartPay.subscription.weeklyBudgetUsd.toFixed(2)} USDC / week until{' '}
                    {new Date(state.smartPay.subscription.expiresAt).toLocaleString()}.
                  </FormStatus>
                  <button
                    className="button"
                    disabled={state.smartPay.busy}
                    onClick={() => void state.smartPay.clearSubscription()}
                    type="button"
                  >
                    clear subscription
                  </button>
                </>
              ) : null}
            </article>
          </div>
        </FlowPanel>

        <FlowPanel active={state.activeTab === 'buyer'} id="account-buyer">
          <article className="flow-card">
            <p className="eyebrow">api keys</p>
            {state.apiKeys.length === 0 ? (
              <p className="quiet-note">No API keys yet.</p>
            ) : (
              <div className="table-list">
                {state.apiKeys.map((key) => (
                  <div className="table-row" key={key.id}>
                    <span>{key.name}</span>
                    <span>{key.prefix}</span>
                    <span>${key.spentUsd.toFixed(2)}</span>
                    <span>{key.revokedAt ? 'revoked' : 'active'}</span>
                    {!key.revokedAt ? (
                      <button
                        className="button"
                        onClick={() => void state.revokeKey(key.id)}
                        type="button"
                      >
                        revoke
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="flow-card">
            <p className="eyebrow">recent purchases</p>
            {state.purchaseRows.length === 0 ? (
              <p className="quiet-note">No inference purchases yet.</p>
            ) : (
              <div className="table-list">
                {state.purchaseRows.map((purchase) => (
                  <div className="table-row" key={purchase.id}>
                    <span>{purchase.modelId ?? 'model n/a'}</span>
                    <span>${purchase.costUsd.toFixed(3)}</span>
                    <span>{new Date(purchase.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
            {(state.purchases.data?.totalSavingsUsd ?? 0) > 0 ? (
              <p className="quiet-note">
                ${state.purchases.data?.totalSavingsUsd.toFixed(2)} total benchmark savings
              </p>
            ) : null}
          </article>
        </FlowPanel>

        <FlowPanel active={state.activeTab === 'seller'} id="account-seller">
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
              <strong>{String(state.session.data.account?.sellerProviderIds.length ?? 0)}</strong>
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
        </FlowPanel>
      </>
    </section>
  );
}
