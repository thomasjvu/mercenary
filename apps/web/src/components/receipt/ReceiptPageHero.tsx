import { formatUsd } from '@bossraid/proof-ui';
import { SummaryPill } from '@bossraid/ui';
import heroMangaReceiptImage from '../../assets/hero-manga-receipt.jpg';
import { MangaSliceArt } from '../system/MangaSliceArt.js';
import type { AppRoute } from '../../lib/app-routes.js';
import type { ReceiptPageState } from '../../hooks/useReceiptPage.js';

type ReceiptPageHeroProps = {
  state: ReceiptPageState;
  onNavigate: (path: AppRoute, options?: { mode?: 'inference' | 'raid' }) => void;
};

export function ReceiptPageHero({ state, onNavigate }: ReceiptPageHeroProps) {
  const { activeQuery, currentReceiptStatus, approvedSubmissionCount, successfulProviderCount } =
    state;

  return (
    <div className="receipt-shell__hero">
      <div className="receipt-shell__copy">
        <p className="eyebrow">shareable receipt</p>
        <h1>
          <span className="receipt-shell__headline-line">One raid.</span>
          <span className="receipt-shell__headline-line">One receipt.</span>
        </h1>
        <p className="lede receipt-shell__lede">
          Load one run, its result, proof links, and settlement record.
        </p>
        <div className="receipt-shell__actions">
          <button
            className="button button--primary"
            disabled={!activeQuery}
            onClick={state.handleCopyLink}
            type="button"
          >
            {state.shareCopied ? 'copied' : 'copy link'}
          </button>
          <a
            className="button"
            href="/mercenary"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('/playground', { mode: 'raid' });
            }}
          >
            playground
          </a>
          <a
            className="button"
            href="/raiders"
            onClick={(event) => {
              event.preventDefault();
              onNavigate('/raiders');
            }}
          >
            raiders
          </a>
        </div>
      </div>

      <aside className="page-stage-card page-stage-card--receipt page-stage-card--manga">
        <MangaSliceArt className="page-stage-card__art" src={heroMangaReceiptImage} />
        <div className="page-stage-card__scrim" />
        <div className="page-stage-card__copy">
          <p className="eyebrow">{activeQuery ? 'loaded proof lane' : 'proof lane'}</p>
          <strong>{activeQuery ? currentReceiptStatus : 'awaiting receipt'}</strong>
          <p>
            {activeQuery
              ? `${approvedSubmissionCount} approved · ${successfulProviderCount} successful · ${state.runtimeAttestationStatus} runtime`
              : 'Load one raid to inspect output, proof, settlement, and provider lineage in a single receipt.'}
          </p>
        </div>
        <div className="page-stage-card__summary">
          <SummaryPill label="runtime" value={state.runtimeAttestationStatus} />
          <SummaryPill
            label="result"
            value={activeQuery ? state.resultAttestationStatus : 'pending'}
          />
          <SummaryPill
            label="split"
            value={
              state.payoutPerSuccessfulProvider == null
                ? 'pending'
                : `${state.successfulProviderCount} x ${formatUsd(state.payoutPerSuccessfulProvider)}`
            }
          />
          <SummaryPill
            label="tee"
            value={`${state.teeProviderCount}/${state.routedProviderIds.length || 0}`}
          />
        </div>
      </aside>
    </div>
  );
}
