import { useState } from 'react';
import { createSellerProvider } from '../api/auth.js';
import { useWalletAuth } from '../hooks/useWalletAuth.js';
import { SellerPathSwitcher } from '../components/seller/SellerPathSwitcher.js';
import type { AppRoute } from '../lib/app-routes.js';

type HttpSellerWizardPageProps = {
  onNavigate: (path: AppRoute) => void;
};

export function HttpSellerWizardPage({ onNavigate }: HttpSellerWizardPageProps) {
  const { session, status, setStatus, isAuthenticated } = useWalletAuth(
    'Connect wallet in the sidebar before registering an HTTP worker.'
  );
  const [name, setName] = useState('HTTP inference seller');
  const [endpoint, setEndpoint] = useState('');
  const [agentFramework, setAgentFramework] = useState('custom');
  const [modelProvider, setModelProvider] = useState('openai');
  const [modelId, setModelId] = useState('gpt-5.5');
  const [pricePerTaskUsd, setPricePerTaskUsd] = useState('0.25');
  const [authToken, setAuthToken] = useState('');
  const [payoutWallet, setPayoutWallet] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishResult, setPublishResult] = useState<{
    providerId: string;
    verificationStatus: string;
  } | null>(null);

  async function handleRegister() {
    if (!endpoint.trim()) {
      setError('Endpoint URL is required.');
      return;
    }

    setPending(true);
    setError(null);
    setPublishResult(null);
    setStatus('Registering HTTP worker...');

    try {
      const result = await createSellerProvider({
        name: name.trim() || 'HTTP inference seller',
        endpoint: endpoint.trim(),
        agentFramework,
        modelProvider: modelProvider.trim() || undefined,
        modelId: modelId.trim() || undefined,
        outputTypes: ['text', 'json'],
        pricing: {
          mode: 'task',
          pricePerTaskUsd: Number(pricePerTaskUsd) || 0.25,
          currency: 'USD',
        },
        payoutWallet: payoutWallet.trim() || session?.wallet,
        auth: authToken.trim() ? { type: 'bearer', token: authToken.trim() } : { type: 'none' },
      });

      setPublishResult({
        providerId: result.provider.providerId,
        verificationStatus: result.provider.verification?.status ?? 'pending',
      });
      setStatus('HTTP worker registered and verified.');
    } catch (registerError) {
      const message =
        registerError instanceof Error ? registerError.message : 'Registration failed.';
      setError(message);
      setStatus(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="beta-page seller-wizard">
      <header className="beta-hero beta-hero--compact">
        <div>
          <p className="eyebrow">sell inference</p>
          <h1>Register HTTP worker</h1>
          <p className="lede">
            Point Boss Raid at your provider endpoint. We verify health and list you on the market.
          </p>
        </div>
      </header>

      <SellerPathSwitcher
        active="http"
        onSelectHttp={() => onNavigate('/onboarding/seller/http')}
        onSelectUpstream={() => onNavigate('/onboarding/seller')}
      />

      <div className="seller-wizard__steps">
        <article className="beta-panel seller-wizard__step">
          <p className="eyebrow">1 / wallet</p>
          {isAuthenticated ? (
            <p className="form-status">Signed in as {session?.wallet}.</p>
          ) : (
            <p className="form-status">{status}</p>
          )}
        </article>

        <article className="beta-panel seller-wizard__step">
          <p className="eyebrow">2 / endpoint</p>
          <div className="form-grid">
            <label className="field">
              <span>offer name</span>
              <input onChange={(event) => setName(event.target.value)} value={name} />
            </label>
            <label className="field">
              <span>endpoint url</span>
              <input
                onChange={(event) => setEndpoint(event.target.value)}
                placeholder="https://seller.example.com/bossraid"
                value={endpoint}
              />
            </label>
            <label className="field">
              <span>agent framework</span>
              <select
                onChange={(event) => setAgentFramework(event.target.value)}
                value={agentFramework}
              >
                <option value="codex">codex</option>
                <option value="claude_code">claude code</option>
                <option value="openclaw">openclaw</option>
                <option value="custom">custom</option>
              </select>
            </label>
            <label className="field">
              <span>model provider</span>
              <input
                onChange={(event) => setModelProvider(event.target.value)}
                placeholder="openai"
                value={modelProvider}
              />
            </label>
            <label className="field">
              <span>model id</span>
              <input
                onChange={(event) => setModelId(event.target.value)}
                placeholder="gpt-5.5"
                value={modelId}
              />
            </label>
            <label className="field">
              <span>price per task usd</span>
              <input
                inputMode="decimal"
                onChange={(event) => setPricePerTaskUsd(event.target.value)}
                value={pricePerTaskUsd}
              />
            </label>
            <label className="field">
              <span>payout wallet</span>
              <input
                onChange={(event) => setPayoutWallet(event.target.value)}
                placeholder={session?.wallet ?? '0x...'}
                value={payoutWallet}
              />
            </label>
            <label className="field">
              <span>ingress bearer token</span>
              <input
                autoComplete="off"
                onChange={(event) => setAuthToken(event.target.value)}
                placeholder="optional"
                spellCheck={false}
                type="password"
                value={authToken}
              />
            </label>
          </div>
        </article>

        <article className="beta-panel seller-wizard__step">
          <p className="eyebrow">3 / register</p>
          <button
            className="button button--primary"
            disabled={!isAuthenticated || pending}
            onClick={() => void handleRegister()}
            type="button"
          >
            {pending ? 'registering...' : 'register worker'}
          </button>
          {error ? <p className="form-status form-status--error">{error}</p> : null}
          <p className="form-status">{status}</p>
        </article>

        {publishResult ? (
          <article className="beta-panel seller-wizard__summary seller-wizard__step--done">
            <p className="eyebrow">published</p>
            <h2>HTTP worker live.</h2>
            <p className="lede">
              {publishResult.providerId} · verification {publishResult.verificationStatus}
            </p>
            <div className="seller-wizard__summary-actions">
              <button
                className="button button--primary"
                onClick={() => onNavigate('/sell/offers')}
                type="button"
              >
                manage offers
              </button>
              <button className="button" onClick={() => onNavigate('/marketplace')} type="button">
                view marketplace
              </button>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}
