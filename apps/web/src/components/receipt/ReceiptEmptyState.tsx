import { buildAttestationSurfaceLabel } from '../../lib/receipt-url.js';
import { readQueryErrorMessage } from '../../lib/receipt-helpers.js';
import { TerminalCodePanel } from '../terminal/TerminalCodePanel.js';
import type { AppRoute } from '../../lib/app-routes.js';
import type { ReceiptPageState } from '../../hooks/useReceiptPage.js';

const PINNED_PROOF_RECEIPT_URL =
  (import.meta.env.VITE_BOSSRAID_PROOF_RECEIPT_URL as string | undefined)?.trim() ?? '';

type ReceiptEmptyStateProps = {
  state: ReceiptPageState;
  onNavigate: (path: AppRoute, options?: { mode?: 'inference' | 'raid' }) => void;
};

export function ReceiptEmptyState({ state, onNavigate }: ReceiptEmptyStateProps) {
  const { attestedRuntime, runtimeSignerDisabledForEmpty } = state;

  return (
    <article className="receipt-empty receipt-empty--viewport">
      <p className="eyebrow">capability link</p>
      <h2>Load one raid receipt.</h2>
      <div className="curl-quickstart curl-quickstart--compact">
        <TerminalCodePanel
          code="/verification?raidId=<raidId>&token=<raidAccessToken>"
          label="receipt url"
          layer="front"
          note="capability link"
          theme="raid"
        />
      </div>
      <div className="receipt-empty__actions">
        {PINNED_PROOF_RECEIPT_URL ? (
          <a className="button button--primary" href={PINNED_PROOF_RECEIPT_URL}>
            open pinned receipt
          </a>
        ) : null}
        <a
          className="button button--primary"
          href="/mercenary"
          onClick={(event) => {
            event.preventDefault();
            onNavigate('/playground', { mode: 'raid' });
          }}
        >
          spawn raid
        </a>
      </div>
      <details className="receipt-empty__details">
        <summary>runtime attestation notes</summary>
        <p>
          {attestedRuntime.data
            ? `${buildAttestationSurfaceLabel(
                attestedRuntime.data.payload.deploymentTarget ?? 'unknown',
                attestedRuntime.data.payload.teePlatform ?? 'unknown'
              )} runtime proof is live.`
            : runtimeSignerDisabledForEmpty
              ? 'Runtime envelope signing is disabled on this host.'
              : attestedRuntime.error
                ? readQueryErrorMessage(attestedRuntime.error)
                : 'Loading runtime attestation.'}
        </p>
        {PINNED_PROOF_RECEIPT_URL ? null : (
          <p>Set VITE_BOSSRAID_PROOF_RECEIPT_URL to pin a proof URL.</p>
        )}
      </details>
    </article>
  );
}
