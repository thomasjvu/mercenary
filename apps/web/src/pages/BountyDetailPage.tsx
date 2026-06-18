import useSWR from 'swr';
import type { BountyAwardRecord, BountyBidRecord } from '@bossraid/shared-types';
import { getBounty } from '../api/bounties.js';

type BountyDetailPageProps = {
  bountyId: string;
  onBack: () => void;
};

export function BountyDetailPage({ bountyId, onBack }: BountyDetailPageProps) {
  const detail = useSWR(['bounty', bountyId], () => getBounty(bountyId));

  if (detail.isLoading) {
    return <section className="page-shell page-flat">Loading bounty…</section>;
  }

  if (!detail.data) {
    return <section className="page-shell page-flat">Bounty not found.</section>;
  }

  const { bounty, bids, awards } = detail.data;

  return (
    <section className="page-shell page-flat bounties-page">
      <button className="btn btn--ghost" type="button" onClick={onBack}>
        ← back to board
      </button>
      <header className="bounties-page__header">
        <div>
          <p className="eyebrow">{bounty.status}</p>
          <h1>{bounty.title}</h1>
          <p className="lede">{bounty.description}</p>
        </div>
        <p className="bounties-card__reward">
          {bounty.rewardAmountUsd.toFixed(2)} {bounty.currency}
        </p>
      </header>

      <div className="bounties-page__detail-grid">
        <article className="page-panel">
          <p className="eyebrow">requirements</p>
          <pre className="code-block">{bounty.requirements}</pre>
          <p className="eyebrow">deadlines</p>
          <ul className="bounties-deadlines">
            <li>bidding: {new Date(bounty.deadlines.biddingDeadlineAt).toLocaleString()}</li>
            <li>award: {new Date(bounty.deadlines.awardDeadlineAt).toLocaleString()}</li>
            <li>delivery: {new Date(bounty.deadlines.deliveryDeadlineAt).toLocaleString()}</li>
            <li>accept: {new Date(bounty.deadlines.acceptDeadlineAt).toLocaleString()}</li>
          </ul>
        </article>

        <article className="page-panel">
          <p className="eyebrow">bids ({bids.length})</p>
          <ul className="bounties-list">
            {bids.map((bid: BountyBidRecord) => (
              <li key={bid.id} className="bounties-card bounties-card--static">
                <span className="bounties-card__title">{bid.providerId}</span>
                <span className="bounties-card__meta">
                  {bid.priceUsd.toFixed(2)} USD · {bid.etaHours}h · {bid.status}
                </span>
                <p>{bid.pitch}</p>
              </li>
            ))}
          </ul>
          <p className="eyebrow">awards ({awards.length})</p>
          <ul className="bounties-list">
            {awards.map((award: BountyAwardRecord) => (
              <li key={award.id} className="bounties-card bounties-card--static">
                <span className="bounties-card__title">{award.providerId}</span>
                <span className="bounties-card__meta">
                  {award.amountUsd.toFixed(2)} USD · {award.status}
                </span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
