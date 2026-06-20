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
  const { hostAttestation, runtimeSignerDisabledForEmpty } = state;

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
        <summary>host attestation notes</summary>
        <p>
          {hostAttestation.data
            ? `${buildAttestationSurfaceLabel(
                hostAttestation.data.deploymentTarget ?? 'unknown',
                hostAttestation.data.teePlatform ?? 'unknown'
              )} host proof is live.`
            : runtimeSignerDisabledForEmpty
              ? 'Host TEE quote is live; signed runtime envelope is not configured.'
              : hostAttestation.error
                ? readQueryErrorMessage(hostAttestation.error)
                : 'Loading host attestation.'}
        </p>
        {PINNED_PROOF_RECEIPT_URL ? null : (
          <p>Set VITE_BOSSRAID_PROOF_RECEIPT_URL to pin a proof URL.</p>
        )}
      </details>
    </article>
  );
}
