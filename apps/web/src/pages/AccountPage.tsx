import { useEffect, useState } from 'react';
import { useSmartAccountPay } from '../hooks/useSmartAccountPay.js';
import useSWR from 'swr';
import type { AppRoute } from '../lib/app-routes.js';
import {
  deleteBuyerApiKey,
  deleteSession,
  fetchBuyerPurchases,
  fetchSellerStats,
  fetchSession,
  fundBuyerBalance,
  listSellerProviders,
  updateSellerProvider,
  verifySellerProvider,
} from '../api';
import { FlowPanel, FlowTabs, type FlowTab } from '../components/system/FlowTabs.js';
import { PageIntro } from '../components/system/PageIntro.js';

const ACCOUNT_TABS = [
  { id: 'wallet', label: 'wallet' },
  { id: 'buyer', label: 'buyer' },
  { id: 'seller', label: 'seller' },
] as const satisfies readonly FlowTab[];

type AccountTabId = (typeof ACCOUNT_TABS)[number]['id'];

type AccountPageProps = {
  onNavigate: (path: AppRoute) => void;
};

export function AccountPage({ onNavigate }: AccountPageProps) {
  const [activeTab, setActiveTab] = useState<AccountTabId>('wallet');
  const session = useSWR('/v1/session', fetchSession);

  useEffect(() => {
    if (session.isLoading || session.data?.authenticated) {
      return;
    }

    onNavigate('/');
  }, [onNavigate, session.data?.authenticated, session.isLoading]);
  const sellers = useSWR(
    session.data?.authenticated ? '/v1/seller/providers' : null,
    listSellerProviders
  );
  const sellerStats = useSWR(
    session.data?.authenticated ? '/v1/seller/stats' : null,
    fetchSellerStats
  );
  const purchases = useSWR(session.data?.authenticated ? '/v1/buyer/purchases' : null, () =>
    fetchBuyerPurchases(20)
  );
  const [fundAmount, setFundAmount] = useState('10');
  const [fundStatus, setFundStatus] = useState('');
  const [sellerActionStatus, setSellerActionStatus] = useState<Record<string, string>>({});
  const smartPay = useSmartAccountPay();

  async function revokeKey(keyId: string) {
    await deleteBuyerApiKey(keyId);
    await session.mutate();
  }

  async function signOut() {
    await deleteSession();
    await session.mutate();
  }

  async function topUpBalance() {
    const amountUsd = Number(fundAmount);
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      setFundStatus('Enter a positive USD amount.');
      return;
    }

    setFundStatus('Crediting prepaid balance...');
    try {
      const result = await fundBuyerBalance(amountUsd);
      await session.mutate();
      setFundStatus(
        `Credited $${result.creditedUsd.toFixed(2)}. New balance $${result.balanceUsd.toFixed(2)}.`
      );
    } catch (error) {
      setFundStatus(error instanceof Error ? error.message : 'Balance top-up failed.');
    }
  }

  async function refreshSellerData() {
    await Promise.all([sellers.mutate(), sellerStats.mutate()]);
  }

  async function toggleOffer(providerId: string, currentStatus: 'active' | 'paused' = 'active') {
    const nextStatus = currentStatus === 'paused' ? 'active' : 'paused';
    setSellerActionStatus((current) => ({ ...current, [providerId]: 'updating offer...' }));

    try {
      await updateSellerProvider(providerId, { marketplaceOfferStatus: nextStatus });
      await refreshSellerData();
      setSellerActionStatus((current) => ({ ...current, [providerId]: `offer ${nextStatus}` }));
    } catch (error) {
      setSellerActionStatus((current) => ({
        ...current,
        [providerId]: error instanceof Error ? error.message : 'offer update failed',
      }));
    }
  }

  async function verifyProvider(providerId: string) {
    setSellerActionStatus((current) => ({ ...current, [providerId]: 'verifying...' }));

    try {
      const result = await verifySellerProvider(providerId);
      await refreshSellerData();
      setSellerActionStatus((current) => ({
        ...current,
        [providerId]: `verification ${result.provider.verification?.status ?? 'pending'}`,
      }));
    } catch (error) {
      setSellerActionStatus((current) => ({
        ...current,
        [providerId]: error instanceof Error ? error.message : 'verification failed',
      }));
    }
  }

  const apiKeys = session.data?.account?.apiKeys ?? [];
  const purchaseRows = purchases.data?.data ?? [];
  const sellerRows = sellers.data?.data ?? [];

  if (session.isLoading || !session.data?.authenticated) {
    return null;
  }

  return (
    <section className="beta-page page-flat flow-page">
      <PageIntro
        actions={
          <button className="button" onClick={() => void signOut()} type="button">
            sign out
          </button>
        }
        title="Account"
      />

      <>
        <FlowTabs
          activeId={activeTab}
          onChange={(id) => setActiveTab(id as AccountTabId)}
          tabs={ACCOUNT_TABS}
        />

        <FlowPanel active={activeTab === 'wallet'} id="account-wallet">
          <div className="account-overview">
            <article className="flow-card">
              <p className="eyebrow">balance</p>
              <p className="account-balance__amount">
                ${(session.data.account?.balanceUsd ?? 0).toFixed(2)}
              </p>
              <p className="quiet-note">{session.data.wallet}</p>
              {(session.data.account?.totalSavingsUsd ?? 0) > 0 ? (
                <p className="quiet-note">
                  ${session.data.account?.totalSavingsUsd?.toFixed(2)} benchmark savings
                </p>
              ) : null}
              <form
                className="account-balance-fund"
                onSubmit={(event) => {
                  event.preventDefault();
                  void topUpBalance();
                }}
              >
                <label className="field">
                  <span>top up usd</span>
                  <input
                    inputMode="decimal"
                    min="0.01"
                    onChange={(event) => setFundAmount(event.target.value)}
                    step="0.01"
                    type="number"
                    value={fundAmount}
                  />
                </label>
                <button className="button button--primary" type="submit">
                  credit balance
                </button>
                {fundStatus ? <p className="form-status">{fundStatus}</p> : null}
              </form>
            </article>

            <article className="flow-card">
              <p className="eyebrow">account subscription</p>
              <p className="quiet-note">
                Weekly MetaMask permission tops up prepaid credit for marketplace inference and
                raids.
              </p>
              <p className="quiet-note">{smartPay.status}</p>
              <div className="mercenary-action-row">
                <button
                  className="button"
                  disabled={smartPay.busy}
                  onClick={() => void smartPay.connectWallet()}
                  type="button"
                >
                  connect MetaMask
                </button>
                <button
                  className="button button--primary"
                  disabled={smartPay.busy}
                  onClick={() => void smartPay.grantSubscription().then(() => session.mutate())}
                  type="button"
                >
                  subscribe & top up
                </button>
              </div>
              {smartPay.subscription ? (
                <>
                  <p className="form-status">
                    ${smartPay.subscription.weeklyBudgetUsd.toFixed(2)} USDC / week until{' '}
                    {new Date(smartPay.subscription.expiresAt).toLocaleString()}.
                  </p>
                  <button
                    className="button"
                    disabled={smartPay.busy}
                    onClick={() => void smartPay.clearSubscription()}
                    type="button"
                  >
                    clear subscription
                  </button>
                </>
              ) : null}
            </article>
          </div>
        </FlowPanel>

        <FlowPanel active={activeTab === 'buyer'} id="account-buyer">
          <article className="flow-card">
            <p className="eyebrow">api keys</p>
            {apiKeys.length === 0 ? (
              <p className="quiet-note">No API keys yet.</p>
            ) : (
              <div className="table-list">
                {apiKeys.map((key) => (
                  <div className="table-row" key={key.id}>
                    <span>{key.name}</span>
                    <span>{key.prefix}</span>
                    <span>${key.spentUsd.toFixed(2)}</span>
                    <span>{key.revokedAt ? 'revoked' : 'active'}</span>
                    {!key.revokedAt ? (
                      <button
                        className="button"
                        onClick={() => void revokeKey(key.id)}
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
            {purchaseRows.length === 0 ? (
              <p className="quiet-note">No inference purchases yet.</p>
            ) : (
              <div className="table-list">
                {purchaseRows.map((purchase) => (
                  <div className="table-row" key={purchase.id}>
                    <span>{purchase.modelId ?? 'model n/a'}</span>
                    <span>${purchase.costUsd.toFixed(3)}</span>
                    <span>{new Date(purchase.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )}
            {(purchases.data?.totalSavingsUsd ?? 0) > 0 ? (
              <p className="quiet-note">
                ${purchases.data?.totalSavingsUsd.toFixed(2)} total benchmark savings
              </p>
            ) : null}
          </article>
        </FlowPanel>

        <FlowPanel active={activeTab === 'seller'} id="account-seller">
          <article className="flow-card account-overview">
            <div className="flow-card__metric">
              <span>lifetime gross</span>
              <strong>${(sellerStats.data?.grossUsd ?? 0).toFixed(2)}</strong>
            </div>
            <div className="flow-card__metric">
              <span>24h earnings</span>
              <strong>${(sellerStats.data?.earnings24hUsd ?? 0).toFixed(2)}</strong>
            </div>
            <div className="flow-card__metric">
              <span>active offers</span>
              <strong>{String(sellerStats.data?.activeOffers ?? 0)}</strong>
            </div>
            <div className="flow-card__metric">
              <span>linked providers</span>
              <strong>{String(session.data.account?.sellerProviderIds.length ?? 0)}</strong>
            </div>
          </article>

          <article className="flow-card">
            <p className="eyebrow">offers</p>
            {sellerRows.length === 0 ? (
              <p className="quiet-note">No seller endpoints registered.</p>
            ) : (
              <div className="table-list seller-offer-list">
                {sellerRows.map((provider) => {
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
                          onClick={() => void toggleOffer(provider.providerId, offerStatus)}
                          type="button"
                        >
                          {offerStatus === 'paused' ? 'resume' : 'pause'}
                        </button>
                        <button
                          className="button"
                          onClick={() => void verifyProvider(provider.providerId)}
                          type="button"
                        >
                          verify
                        </button>
                      </div>
                      {sellerActionStatus[provider.providerId] ? (
                        <p className="form-status seller-offer-row__status">
                          {sellerActionStatus[provider.providerId]}
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
