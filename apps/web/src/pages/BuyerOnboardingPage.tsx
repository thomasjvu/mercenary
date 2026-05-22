import { useState } from 'react';
import {
  createAuthNonce,
  createBuyerApiKey,
  fetchSession,
  verifyAuth,
  type PublicSession,
} from '../api';

type EthereumProvider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
};

export function BuyerOnboardingPage() {
  const [session, setSession] = useState<PublicSession | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [status, setStatus] = useState('Connect a wallet to create a buyer account.');
  const [keyName, setKeyName] = useState('Beta buyer key');
  const [spendLimit, setSpendLimit] = useState('5');

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

  async function createKey() {
    const created = await createBuyerApiKey({
      name: keyName,
      spendLimitUsd: spendLimit.trim() ? Number(spendLimit) : undefined,
    });
    setApiKey(created.apiKey);
    setSession(await fetchSession());
    setStatus('API key created. It is only shown once.');
  }

  return (
    <section className="beta-page">
      <header className="beta-hero beta-hero--compact">
        <div>
          <p className="eyebrow">buyer onboarding</p>
          <h1>Wallet, API key, paid request.</h1>
          <p className="lede">
            Buyers authenticate with a wallet, create prefixed API keys, set spend limits, and use
            x402/USDC payment rails for paid inference and raids.
          </p>
        </div>
      </header>

      <div className="onboarding-grid">
        <article className="beta-panel">
          <p className="eyebrow">1 / wallet sign-in</p>
          <h2>Own the account.</h2>
          <p>
            The public app uses a SIWE-style nonce and signature flow. Admin registry tokens stay
            internal and never appear in buyer onboarding.
          </p>
          <button
            className="button button--primary"
            onClick={() => void connectWallet()}
            type="button"
          >
            connect wallet
          </button>
          <p className="form-status">{status}</p>
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

function readEthereum(): EthereumProvider | undefined {
  return (globalThis as typeof globalThis & { ethereum?: EthereumProvider }).ethereum;
}
