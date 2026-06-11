import useSWR from 'swr';
import {
  deleteBuyerApiKey,
  deleteSession,
  fetchSellerEarnings,
  fetchSession,
  listSellerProviders,
} from '../api';

export function AccountPage() {
  const session = useSWR('/v1/session', fetchSession);
  const sellers = useSWR(
    session.data?.authenticated ? '/v1/seller/providers' : null,
    listSellerProviders
  );
  const earnings = useSWR(
    session.data?.authenticated ? '/v1/seller/earnings' : null,
    fetchSellerEarnings
  );

  async function revokeKey(keyId: string) {
    await deleteBuyerApiKey(keyId);
    await session.mutate();
  }

  async function signOut() {
    await deleteSession();
    await session.mutate();
  }

  return (
    <section className="beta-page">
      <header className="beta-hero beta-hero--compact">
        <div>
          <p className="eyebrow">account</p>
          <h1>Keys, usage, sellers, payouts.</h1>
          <p className="lede">
            Public beta account state is wallet-bound. Full production still needs durable SQL,
            encrypted provider ingress secrets, and expanded abuse controls.
          </p>
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
            <p>${(session.data.account?.balanceUsd ?? 0).toFixed(2)} prepaid balance.</p>
            {(session.data.account?.totalSavingsUsd ?? 0) > 0 ? (
              <p>${session.data.account?.totalSavingsUsd?.toFixed(2)} benchmark savings.</p>
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
            <p className="eyebrow">seller providers</p>
            <div className="table-list">
              {(sellers.data?.data ?? []).length === 0 ? (
                <p>No seller endpoints registered.</p>
              ) : (
                sellers.data?.data.map((provider) => (
                  <div className="table-row" key={provider.providerId}>
                    <span>{provider.displayName}</span>
                    <span>{provider.modelId ?? 'model n/a'}</span>
                    <span>{provider.verification?.status ?? 'pending'}</span>
                    <span>${provider.pricePerTaskUsd.toFixed(2)}</span>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="beta-panel">
            <p className="eyebrow">seller earnings</p>
            <h2>${(earnings.data?.grossUsd ?? 0).toFixed(2)}</h2>
            <p>{earnings.data?.payoutCount ?? 0} payout records.</p>
          </article>
        </div>
      )}
    </section>
  );
}
