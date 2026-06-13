import { useState } from 'react';
import { Icon } from '@iconify/react';
import { createBuyerApiKey, fetchSession } from '../api';
import { useWalletAuth } from '../hooks/useWalletAuth';
import { buildInferenceCurlSnippet } from '../lib/inference-curl.js';

export function BuyerOnboardingPage() {
  const { session, setSession, status, setStatus, isAuthenticated } = useWalletAuth(
    'Use connect wallet in the sidebar to create a buyer account.'
  );
  const [apiKey, setApiKey] = useState<string>('');
  const [keyName, setKeyName] = useState('Beta buyer key');
  const [spendLimit, setSpendLimit] = useState('5');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createKey() {
    setKeyError(null);
    try {
      const created = await createBuyerApiKey({
        name: keyName,
        spendLimitUsd: spendLimit.trim() ? Number(spendLimit) : undefined,
      });
      setApiKey(created.apiKey);
      await setSession(await fetchSession());
      setStatus('API key created. It is only shown once.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create API key.';
      setKeyError(message);
      setStatus(message);
    }
  }

  async function copyKey() {
    if (!apiKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
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
            <p className="form-status">{status}</p>
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
          {keyError ? <p className="form-status form-status--error">{keyError}</p> : null}
          {apiKey ? (
            <>
              <p className="form-status form-status--warning">
                Copy this key now. Boss Raid will not show it again.
              </p>
              <div className="code-panel-row">
                <pre className="code-panel">{apiKey}</pre>
                <button className="button" onClick={() => void copyKey()} type="button">
                  <Icon aria-hidden="true" className="icon icon--pixel" icon="pixel:copy-solid" />
                  {copied ? 'copied' : 'copy key'}
                </button>
              </div>
            </>
          ) : null}
        </article>

        <article className="beta-panel beta-panel--wide">
          <p className="eyebrow">3 / test request</p>
          <h2>Call the discount lane.</h2>
          <pre className="code-panel">
            {buildInferenceCurlSnippet({
              apiBase: '/api',
              model: 'gpt-5.5',
              apiKey: apiKey || 'br_...',
              relativePath: true,
            })}
          </pre>
        </article>
      </div>
    </section>
  );
}
