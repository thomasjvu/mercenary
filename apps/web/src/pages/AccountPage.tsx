import { useState } from 'react';
import { useSmartAccountPay } from '../hooks/useSmartAccountPay.js';
import useSWR from 'swr';
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

export function AccountPage() {
  const session = useSWR('/v1/session', fetchSession);
  const sellers = useSWR(
    session.data?.authenticated ? '/v1/seller/providers' : null,
    listSellerProviders
  );
  const sellerStats = useSWR(
    session.data?.authenticated ? '/v1/seller/stats' : null,
    fetchSellerStats
  );
  const purchases = useSWR(session.data?.authenticated ? '/v1/buyer/purchases' : null, () =>
    fetchBuyerPurchases(50)
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

  return (
    <section className="beta-page">
      <header className="beta-hero beta-hero--compact">
        <div>
          <p className="eyebrow">account</p>
          <h1>Keys, usage, sellers, payouts.</h1>
          <p className="lede">Wallet-bound beta account state.</p>
        </div>
        {session.data?.authenticated ? (
          <button className="button" onClick={() => void signOut()} type="button">
            sign out
          </button>
        ) : null}
      </header>

      {!session.data?.authenticated ? (
        <div className="empty-state">
          <p className="eyebrow">not signed in</p>
          <p>Use buyer or seller onboarding to create a wallet session first.</p>
        </div>
      ) : (
        <div className="account-grid">
          <article className="beta-panel">
            <p className="eyebrow">wallet</p>
            <h2>{session.data.wallet}</h2>
            <p>{session.data.account?.sellerProviderIds.length ?? 0} seller providers linked.</p>
            <p className="account-balance__amount">
              ${(session.data.account?.balanceUsd ?? 0).toFixed(2)} prepaid balance.
            </p>
            {(session.data.account?.totalSavingsUsd ?? 0) > 0 ? (
              <p>${session.data.account?.totalSavingsUsd?.toFixed(2)} benchmark savings.</p>
            ) : null}

            <form
              className="account-balance-fund"
              onSubmit={(event) => {
                event.preventDefault();
                void topUpBalance();
              }}
            >
              <p className="eyebrow">top up balance</p>
              <label className="field">
                <span>amount usd</span>
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

          <article className="beta-panel">
            <p className="eyebrow">raid subscription</p>
            <h2>ERC-7715 weekly budget</h2>
            <p>{smartPay.status}</p>
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
                onClick={() => void smartPay.grantSubscription()}
                type="button"
              >
                grant weekly budget
              </button>
              <button
                className="button"
                disabled={smartPay.busy}
                onClick={() => void smartPay.clearSubscription()}
                type="button"
              >
                clear session
              </button>
            </div>
            {smartPay.subscription ? (
              <p>
                Active grant: ${smartPay.subscription.weeklyBudgetUsd.toFixed(2)} USDC / week until{' '}
                {new Date(smartPay.subscription.expiresAt).toLocaleString()}.
              </p>
            ) : null}
          </article>

          <article className="beta-panel beta-panel--wide">
            <p className="eyebrow">buyer API keys</p>
            <div className="table-list">
              {(session.data.account?.apiKeys ?? []).length === 0 ? (
                <p>No API keys yet.</p>
              ) : (
                session.data.account?.apiKeys.map((key) => (
                  <div className="table-row" key={key.id}>
                    <span>{key.name}</span>
                    <span>{key.prefix}</span>
                    <span>${key.spentUsd.toFixed(2)} spent</span>
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
                ))
              )}
            </div>
          </article>

          <article className="beta-panel beta-panel--wide">
            <p className="eyebrow">purchase history</p>
            <div className="table-list">
              {(purchases.data?.data ?? []).length === 0 ? (
                <p>No inference purchases yet.</p>
              ) : (
                purchases.data?.data.map((purchase) => (
                  <div className="table-row" key={purchase.id}>
                    <span>{purchase.modelId ?? 'model n/a'}</span>
                    <span>{purchase.route}</span>
                    <span>${purchase.costUsd.toFixed(3)}</span>
                    <span>
                      {purchase.savingsUsd != null && purchase.savingsUsd > 0
                        ? `$${purchase.savingsUsd.toFixed(3)} saved`
                        : '—'}
                    </span>
                    <span>{new Date(purchase.createdAt).toLocaleString()}</span>
                  </div>
                ))
              )}
            </div>
            {(purchases.data?.totalSavingsUsd ?? 0) > 0 ? (
              <p>${purchases.data?.totalSavingsUsd.toFixed(2)} total benchmark savings.</p>
            ) : null}
          </article>

          <article className="beta-panel beta-panel--wide seller-stats-panel">
            <p className="eyebrow">seller dashboard</p>
            <div className="metric-grid seller-stats-panel__metrics">
              <Metric
                label="lifetime gross"
                value={`$${(sellerStats.data?.grossUsd ?? 0).toFixed(2)}`}
              />
              <Metric
                label="24h earnings"
                value={`$${(sellerStats.data?.earnings24hUsd ?? 0).toFixed(2)}`}
              />
              <Metric label="routed 24h" value={String(sellerStats.data?.routedRequests24h ?? 0)} />
              <Metric label="active offers" value={String(sellerStats.data?.activeOffers ?? 0)} />
              <Metric label="paused offers" value={String(sellerStats.data?.pausedOffers ?? 0)} />
              <Metric label="payouts" value={String(sellerStats.data?.payoutCount ?? 0)} />
            </div>

            <div className="table-list seller-offer-list">
              {(sellers.data?.data ?? []).length === 0 ? (
                <p>No seller endpoints registered.</p>
              ) : (
                sellers.data?.data.map((provider) => {
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
                        <span>{provider.verification?.status ?? 'pending'}</span>
                      </div>
                      <div className="seller-offer-row__actions">
                        <button
                          className="button"
                          onClick={() => void toggleOffer(provider.providerId, offerStatus)}
                          type="button"
                        >
                          {offerStatus === 'paused' ? 'resume offer' : 'pause offer'}
                        </button>
                        <button
                          className="button"
                          onClick={() => void verifyProvider(provider.providerId)}
                          type="button"
                        >
                          re-verify
                        </button>
                      </div>
                      {sellerActionStatus[provider.providerId] ? (
                        <p className="form-status seller-offer-row__status">
                          {sellerActionStatus[provider.providerId]}
                        </p>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="metric">
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}
