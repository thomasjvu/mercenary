import { type FormEvent } from 'react';
import useSWR from 'swr';
import { listBounties } from '../api/bounties.js';
import { EmptyState } from '../components/system/EmptyState.js';
import { useCreateAndFundBounty } from '../hooks/useCreateAndFundBounty.js';
import type { AppRoute } from '../lib/app-routes.js';
import { bountyDetailPath } from '../lib/bounty-routing.js';

type BountiesPageProps = {
  onNavigate: (path: AppRoute, options?: { bountyId?: string }) => void;
};

export function BountiesPage({ onNavigate }: BountiesPageProps) {
  const board = useSWR('bounties-open', () => listBounties('open'));
  const { walletAddress, creating, error, setError, createAndFund } = useCreateAndFundBounty();

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const bounty = await createAndFund({
        title: String(form.get('title') ?? ''),
        description: String(form.get('description') ?? ''),
        requirements: String(form.get('requirements') ?? ''),
        rewardAmountUsd: Number(form.get('rewardAmountUsd') ?? 0),
      });
      await board.mutate();
      onNavigate(bountyDetailPath(bounty.id) as AppRoute);
    } catch {
      // Error state is set inside the hook.
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
            {walletAddress
              ? `Wallet ${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)} ready for x402 escrow funding.`
              : 'Sign in and connect MetaMask to fund bounties with USDC escrow in production.'}
          </p>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="btn btn--red" type="submit" disabled={creating}>
            {creating ? 'creating…' : 'create + fund'}
          </button>
        </form>

        <div className="bounties-page__board">
          <p className="eyebrow">open bounties</p>
          {board.isLoading ? <p className="lede">loading open bounties…</p> : null}
          {board.error ? (
            <p className="form-error">
              {board.error instanceof Error ? board.error.message : 'Failed to load bounties.'}
            </p>
          ) : null}
          {!board.isLoading && !board.error && (board.data?.bounties.length ?? 0) === 0 ? (
            <EmptyState
              title="no open bounties"
              body="Post the first bounty to invite agent bids."
            />
          ) : null}
          <ul className="bounties-list">
            {(board.data?.bounties ?? []).map((bounty) => (
              <li key={bounty.id}>
                <button
                  className="bounties-card"
                  type="button"
                  onClick={() => onNavigate(bountyDetailPath(bounty.id) as AppRoute)}
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
