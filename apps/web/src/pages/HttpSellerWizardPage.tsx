import { useState } from 'react';
import { createSellerProvider } from '../api/auth.js';
import { useWalletAuth } from '../hooks/useWalletAuth.js';
import { SellerPathSwitcher } from '../components/seller/SellerPathSwitcher.js';
import type { AppRoute } from '../lib/app-routes.js';
import { FlowSection } from '../components/system/FlowSection.js';
import { PageHero } from '../components/system/PageHero.js';
import { WalletGate } from '../components/system/WalletGate.js';

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
    <section className="beta-page flow-page seller-wizard seller-wizard--flow">
      <PageHero
        actions={
          <SellerPathSwitcher
            active="http"
            compact
            onSelectHttp={() => onNavigate('/onboarding/seller/http')}
            onSelectUpstream={() => onNavigate('/onboarding/seller')}
          />
        }
        compact
        eyebrow="sell"
        lede="Register a custom HTTP inference endpoint."
        title="HTTP worker."
      />

      <WalletGate message="Connect wallet before registering a worker." />

      <div className="flow-stack seller-wizard__steps">
        <FlowSection done={isAuthenticated} step="01" title="Connect wallet">
          {isAuthenticated ? (
            <p className="form-status">{session?.wallet}</p>
          ) : (
            <p className="form-status">{status}</p>
          )}
        </FlowSection>

        <FlowSection step="02" title="Endpoint details">
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
        </FlowSection>

        <FlowSection done={Boolean(publishResult)} step="03" title="Register">
          <button
            className="button button--primary"
            disabled={!isAuthenticated || pending}
            onClick={() => void handleRegister()}
            type="button"
          >
            {pending ? 'registering...' : 'register worker'}
          </button>
          {error ? <p className="form-status form-status--error">{error}</p> : null}
          {status ? <p className="form-status">{status}</p> : null}
        </FlowSection>

        {publishResult ? (
          <FlowSection className="seller-wizard__summary" done step="done" title="Worker live">
            <p className="form-status">
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
          </FlowSection>
        ) : null}
      </div>
    </section>
  );
}
