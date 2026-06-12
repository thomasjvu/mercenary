import { useState } from 'react';
import { createBuyerApiKey, fetchSession } from '../api';
import { useWalletAuth } from '../hooks/useWalletAuth';

export function BuyerOnboardingPage() {
  const { session, setSession, status, setStatus, connectWallet, isAuthenticated } = useWalletAuth(
    'Use connect wallet in the sidebar to create a buyer account.'
  );
  const [apiKey, setApiKey] = useState<string>('');
  const [keyName, setKeyName] = useState('Beta buyer key');
  const [spendLimit, setSpendLimit] = useState('5');

  async function createKey() {
    const created = await createBuyerApiKey({
      name: keyName,
      spendLimitUsd: spendLimit.trim() ? Number(spendLimit) : undefined,
    });
    setApiKey(created.apiKey);
    await setSession(await fetchSession());
    setStatus('API key created. It is only shown once.');
  }

  return (
    <section className="beta-page">
      <header className="beta-hero beta-hero--compact">
        <div>
          <p className="eyebrow">buyer onboarding</p>
          <h1>Wallet, API key, paid request.</h1>
          <p className="lede">Wallet sign-in → capped API key → discount inference.</p>
        </div>
      </header>

      <div className="onboarding-grid">
        <article className="beta-panel">
          <p className="eyebrow">1 / wallet sign-in</p>
          <h2>Own the account.</h2>
          <p>SIWE wallet sign-in via the sidebar control.</p>
          {isAuthenticated ? (
            <p className="form-status">Signed in as {session?.wallet}.</p>
          ) : (
            <>
              <button
                className="button button--primary"
                onClick={() => void connectWallet()}
                type="button"
              >
                connect wallet
              </button>
              <p className="form-status">{status}</p>
            </>
          )}
        </article>

        <article className="beta-panel">
          <p className="eyebrow">2 / API key</p>
          <h2>Create a capped key.</h2>
          <label className="field">
            <span>key name</span>
            <input onChange={(event) => setKeyName(event.target.value)} value={keyName} />
          </label>
          <label className="field">
            <span>spend cap usd</span>
            <input
              inputMode="decimal"
              onChange={(event) => setSpendLimit(event.target.value)}
              value={spendLimit}
            />
          </label>
          <button
            className="button button--primary"
            disabled={!session?.authenticated}
            onClick={() => void createKey()}
            type="button"
          >
            create key
          </button>
          {apiKey ? <pre className="code-panel">{apiKey}</pre> : null}
        </article>

        <article className="beta-panel beta-panel--wide">
          <p className="eyebrow">3 / test request</p>
          <h2>Call the discount lane.</h2>
          <pre className="code-panel">{`curl -X POST /api/v1/inference/chat/completions \\
  -H "authorization: Bearer ${apiKey || 'br_...'}" \\
  -H "content-type: application/json" \\
  -d '{"model":"gpt-5.5","messages":[{"role":"user","content":"Use the cheapest verified seller."}],"raid_policy":{"max_total_cost":1,"privacy_mode":"prefer"}}'`}</pre>
        </article>
      </div>
    </section>
  );
}
