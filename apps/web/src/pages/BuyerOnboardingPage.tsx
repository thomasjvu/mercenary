import { useState } from 'react';
import { Icon } from '@iconify/react';
import { createBuyerApiKey, fetchSession } from '../api';
import { useWalletAuth } from '../hooks/useWalletAuth';
import { FlowSection } from '../components/system/FlowSection.js';
import { PageHero } from '../components/system/PageHero.js';
import { WalletGate } from '../components/system/WalletGate.js';
import { CurlQuickstart } from '../components/terminal/CurlQuickstart.js';
import { buildInferenceCurlSnippet } from '../lib/inference-curl.js';

export function BuyerOnboardingPage() {
  const { session, setSession, status, setStatus, isAuthenticated } = useWalletAuth(
    'Connect wallet to create a buyer account.'
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
      setStatus('API key created.');
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

  const curl = buildInferenceCurlSnippet({
    apiBase: '/api',
    model: 'gpt-5.5',
    apiKey: apiKey || 'br_...',
    relativePath: true,
  });

  return (
    <section className="beta-page flow-page buyer-page">
      <PageHero
        compact
        eyebrow="buy"
        lede="Wallet, capped key, inference or raid spend."
        title="Buy inference."
      />

      <WalletGate />

      <div className="flow-stack">
        <FlowSection done={isAuthenticated} step="01" title="Connect wallet">
          {isAuthenticated ? (
            <p className="form-status">{session?.wallet}</p>
          ) : (
            <p className="form-status">{status}</p>
          )}
        </FlowSection>

        <FlowSection done={Boolean(apiKey)} step="02" title="Create API key">
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
            <div className="code-panel-row">
              <pre className="code-panel">{apiKey}</pre>
              <button className="button" onClick={() => void copyKey()} type="button">
                <Icon aria-hidden="true" className="icon icon--pixel" icon="pixel:copy-solid" />
                {copied ? 'copied' : 'copy key'}
              </button>
            </div>
          ) : null}
        </FlowSection>

        <FlowSection step="03" title="Send a test request">
          <CurlQuickstart code={curl} compact runHref="/playground" />
        </FlowSection>
      </div>
    </section>
  );
}
