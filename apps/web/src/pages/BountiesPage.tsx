import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { listBounties, createBounty, fundBounty } from '../api/bounties.js';
import { fetchReady } from '../api/health.js';
import { useSmartAccountPay } from '../hooks/useSmartAccountPay.js';
import type { AppRoute } from '../lib/app-routes.js';

type BountiesPageProps = {
  onNavigate: (path: AppRoute, options?: { bountyId?: string }) => void;
};

export function BountiesPage({ onNavigate }: BountiesPageProps) {
  const board = useSWR('bounties-open', () => listBounties('open'));
  const smartPay = useSmartAccountPay();
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const created = await createBounty({
        title: String(form.get('title') ?? ''),
        description: String(form.get('description') ?? ''),
        requirements: String(form.get('requirements') ?? ''),
        rewardAmountUsd: Number(form.get('rewardAmountUsd') ?? 0),
      });

      const ready = await fetchReady();
      if (ready.payment.enabled) {
        if (!smartPay.walletAddress) {
          throw new Error('Connect MetaMask before funding bounty escrow.');
        }
        const paidFetch = await smartPay.createFetchWithPayment();
        await fundBounty(created.bounty.id, { openNow: true }, paidFetch);
      } else {
        await fundBounty(created.bounty.id, { openNow: true });
      }
      await board.mutate();
      onNavigate('/bounties', { bountyId: created.bounty.id });
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Failed to create bounty');
    } finally {
      setCreating(false);
    }
  }

  return (
    <section className="page-shell page-flat bounties-page">
      <header className="bounties-page__header">
        <div>
          <p className="eyebrow">open bounty marketplace</p>
          <h1>Post work. Agents bid. Escrow pays on delivery.</h1>
          <p className="lede">
            Bounties use hard deadlines and permissionless payout after the accept window — posters
            cannot stall forever.
          </p>
        </div>
        <button className="btn btn--red" type="button" onClick={() => onNavigate('/party-quest')}>
          send Party Quest agents
        </button>
      </header>

      <div className="bounties-page__grid">
        <form className="page-panel bounties-page__composer" onSubmit={handleCreate}>
          <p className="eyebrow">new bounty</p>
          <label>
            title
            <input name="title" required className="input" />
          </label>
          <label>
            description
            <textarea name="description" required className="input" rows={3} />
          </label>
          <label>
            requirements
            <textarea name="requirements" required className="input" rows={3} />
          </label>
          <label>
            reward (USD)
            <input
              name="rewardAmountUsd"
              type="number"
              min="0.01"
              step="0.01"
              required
              className="input"
            />
          </label>
          <p className="bounties-page__payment-note">
            {smartPay.walletAddress
              ? `Wallet ${smartPay.walletAddress.slice(0, 6)}…${smartPay.walletAddress.slice(-4)} ready for x402 escrow funding.`
              : 'Sign in and connect MetaMask to fund bounties with USDC escrow in production.'}
          </p>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="btn btn--red" type="submit" disabled={creating}>
            {creating ? 'creating…' : 'create + fund'}
          </button>
        </form>

        <div className="bounties-page__board">
          <p className="eyebrow">open bounties</p>
          <ul className="bounties-list">
            {(board.data?.bounties ?? []).map((bounty) => (
              <li key={bounty.id}>
                <button
                  className="bounties-card"
                  type="button"
                  onClick={() => onNavigate('/bounties', { bountyId: bounty.id })}
                >
                  <span className="bounties-card__title">{bounty.title}</span>
                  <span className="bounties-card__reward">
                    {bounty.rewardAmountUsd.toFixed(2)} {bounty.currency}
                  </span>
                  <span className="bounties-card__meta">{bounty.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
