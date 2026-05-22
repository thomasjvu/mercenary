import { useState } from 'react';
import {
  createAuthNonce,
  createSellerProvider,
  fetchSession,
  verifyAuth,
  type Provider,
  type PublicSession,
} from '../api';

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export function SellerOnboardingPage() {
  const [session, setSession] = useState<PublicSession | null>(null);
  const [status, setStatus] = useState('Connect a wallet before registering a seller endpoint.');
  const [provider, setProvider] = useState<Provider | null>(null);
  const [form, setForm] = useState({
    name: 'Verified GPT seller',
    endpoint: 'http://127.0.0.1:4317',
    framework: 'codex',
    modelProvider: 'openai',
    modelId: 'gpt-5.5',
    rate: '0.25',
    payoutWallet: '',
    teeAttested: false,
    signedOutputs: false,
    noDataRetention: true,
  });

  async function connectWallet() {
    const ethereum = readEthereum();
    if (!ethereum) {
      setStatus('No wallet provider found. Install a wallet that supports personal_sign.');
      return;
    }

    const accounts = (await ethereum.request({ method: 'eth_requestAccounts' })) as string[];
    const wallet = accounts[0];
    if (!wallet) {
      setStatus('Wallet did not return an account.');
      return;
    }

    const nonce = await createAuthNonce(wallet);
    const signature = (await ethereum.request({
      method: 'personal_sign',
      params: [nonce.message, wallet],
    })) as string;
    const verified = await verifyAuth(wallet, nonce.message, signature);
    setSession(verified);
    setStatus(`Signed in as ${wallet}.`);
  }

  async function registerProvider() {
    const registered = await createSellerProvider({
      name: form.name,
      endpoint: form.endpoint,
      agentFramework: form.framework,
      modelProvider: form.modelProvider,
      modelId: form.modelId,
      pricing: {
        pricePerTaskUsd: Number(form.rate),
      },
      payoutWallet: form.payoutWallet || session?.wallet,
      capabilities: ['analysis', 'text'],
      supportedLanguages: ['text'],
      outputTypes: ['text', 'json'],
      auth: {
        type: 'none',
      },
      privacy: {
        teeAttested: form.teeAttested,
        signedOutputs: form.signedOutputs,
        noDataRetention: form.noDataRetention,
      },
    });
    setProvider(registered.provider);
    setSession(await fetchSession());
    setStatus(`Verification ${registered.provider.verification?.status ?? 'pending'}.`);
  }

  return (
    <section className="beta-page">
      <header className="beta-hero beta-hero--compact">
        <div>
          <p className="eyebrow">seller onboarding</p>
          <h1>Sell clean agent capacity.</h1>
          <p className="lede">
            Register an endpoint you are authorized to operate. Boss Raid verifies the provider
            interface, declared framework/model, and privacy claims before routing paid work.
          </p>
        </div>
      </header>

      <div className="onboarding-grid">
        <article className="beta-panel">
          <p className="eyebrow">1 / ownership</p>
          <h2>Sign in with wallet.</h2>
          <p>Seller ownership, API keys, spend, provider status, and payouts are account-bound.</p>
          <button
            className="button button--primary"
            onClick={() => void connectWallet()}
            type="button"
          >
            connect wallet
          </button>
          <p className="form-status">{status}</p>
        </article>

        <article className="beta-panel beta-panel--wide">
          <p className="eyebrow">2 / endpoint metadata</p>
          <h2>Register and verify.</h2>
          <div className="form-grid">
            <TextField
              label="name"
              value={form.name}
              onChange={(name) => setForm({ ...form, name })}
            />
            <TextField
              label="endpoint"
              value={form.endpoint}
              onChange={(endpoint) => setForm({ ...form, endpoint })}
            />
            <TextField
              label="model provider"
              value={form.modelProvider}
              onChange={(modelProvider) => setForm({ ...form, modelProvider })}
            />
            <TextField
              label="model id"
              value={form.modelId}
              onChange={(modelId) => setForm({ ...form, modelId })}
            />
            <TextField
              label="rate usd"
              value={form.rate}
              onChange={(rate) => setForm({ ...form, rate })}
            />
            <TextField
              label="payout wallet"
              value={form.payoutWallet}
              onChange={(payoutWallet) => setForm({ ...form, payoutWallet })}
            />
            <label className="field">
              <span>framework</span>
              <select
                onChange={(event) => setForm({ ...form, framework: event.target.value })}
                value={form.framework}
              >
                <option value="codex">codex</option>
                <option value="claude_code">claude code</option>
                <option value="openclaw">openclaw</option>
                <option value="custom">custom</option>
              </select>
            </label>
          </div>
          <div className="check-row">
            <label>
              <input
                checked={form.teeAttested}
                onChange={(event) => setForm({ ...form, teeAttested: event.target.checked })}
                type="checkbox"
              />
              TEE attested
            </label>
            <label>
              <input
                checked={form.signedOutputs}
                onChange={(event) => setForm({ ...form, signedOutputs: event.target.checked })}
                type="checkbox"
              />
              signed outputs
            </label>
            <label>
              <input
                checked={form.noDataRetention}
                onChange={(event) => setForm({ ...form, noDataRetention: event.target.checked })}
                type="checkbox"
              />
              no retention
            </label>
          </div>
          <button
            className="button button--primary"
            disabled={!session?.authenticated}
            onClick={() => void registerProvider()}
            type="button"
          >
            register and verify
          </button>
        </article>

        <article className="beta-panel">
          <p className="eyebrow">verification result</p>
          {provider ? (
            <>
              <h2>{provider.displayName}</h2>
              <div className="metric-grid">
                <span className="metric">
                  <small>status</small>
                  <strong>{provider.verification?.status ?? 'pending'}</strong>
                </span>
                <span className="metric">
                  <small>rate</small>
                  <strong>${provider.pricePerTaskUsd.toFixed(2)}</strong>
                </span>
              </div>
            </>
          ) : (
            <p>No provider registered in this session yet.</p>
          )}
        </article>
      </div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input onChange={(event) => onChange(event.target.value)} value={value} />
    </label>
  );
}

function readEthereum(): EthereumProvider | undefined {
  return (globalThis as typeof globalThis & { ethereum?: EthereumProvider }).ethereum;
}
