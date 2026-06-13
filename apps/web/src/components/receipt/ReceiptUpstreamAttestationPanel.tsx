import type { ReceiptUpstreamAttestationRow } from '../../lib/receipt-attestation-view';
import { formatPrivacyFeatureLabel } from '../../lib/receipt-attestation-view';

type ReceiptUpstreamAttestationPanelProps = {
  rows: ReceiptUpstreamAttestationRow[];
  privacyMode?: 'off' | 'prefer' | 'strict';
  overallPassed?: boolean;
  overallScore?: number;
};

function PrivacyFeatureBadges({ claimed, verified }: { claimed: string[]; verified: string[] }) {
  if (claimed.length === 0) {
    return null;
  }

  return (
    <ul className="receipt-upstream-attestation__features">
      {claimed.map((feature) => {
        const isVerified = verified.includes(feature);
        return (
          <li
            className={
              isVerified
                ? 'receipt-upstream-attestation__feature receipt-upstream-attestation__feature--verified'
                : 'receipt-upstream-attestation__feature receipt-upstream-attestation__feature--claimed'
            }
            key={feature}
          >
            {formatPrivacyFeatureLabel(feature)}
            {isVerified ? ' · verified' : ' · claimed'}
          </li>
        );
      })}
    </ul>
  );
}

function ReceiptUpstreamAttestationCard({ row }: { row: ReceiptUpstreamAttestationRow }) {
  const tee = row.attestation.teeAttestation;
  const vendor = tee?.upstreamVendor ?? tee?.vendor;

  return (
    <article className="receipt-upstream-attestation__card">
      <div className="receipt-upstream-attestation__head">
        <div>
          <strong>{row.displayName}</strong>
          <p className="receipt-upstream-attestation__provider-id">{row.providerId}</p>
        </div>
        <span
          className={
            tee?.valid
              ? 'receipt-upstream-attestation__status receipt-upstream-attestation__status--ok'
              : 'receipt-upstream-attestation__status'
          }
        >
          {tee ? (tee.valid ? 'upstream tee verified' : 'upstream tee failed') : 'privacy declared'}
        </span>
      </div>

      {vendor ? <p className="receipt-upstream-attestation__meta">vendor: {vendor}</p> : null}
      {tee?.signingAddress ? (
        <p className="receipt-upstream-attestation__meta">signing address: {tee.signingAddress}</p>
      ) : null}
      {tee?.e2eeReady ? (
        <p className="receipt-upstream-attestation__meta">E2EE key ready on upstream host</p>
      ) : null}
      {row.attestation.dataRetained === false ? (
        <p className="receipt-upstream-attestation__meta">no upstream data retention declared</p>
      ) : null}

      <PrivacyFeatureBadges
        claimed={row.attestation.featuresClaimed}
        verified={row.attestation.featuresVerified}
      />

      {tee?.checks && tee.checks.length > 0 ? (
        <ul className="upstream-tee-panel__checks receipt-upstream-attestation__checks">
          {tee.checks.map((check) => (
            <li
              className={
                check.passed ? 'upstream-tee-panel__check--pass' : 'upstream-tee-panel__check--fail'
              }
              key={check.id}
            >
              {check.passed ? '✓' : '✗'} {check.detail ?? check.id}
            </li>
          ))}
        </ul>
      ) : null}

      {row.settlementPassed != null ? (
        <p className="receipt-upstream-attestation__meta">
          settlement privacy check: {row.settlementPassed ? 'passed' : 'failed'}
          {row.settlementScore != null ? ` · score ${row.settlementScore}` : ''}
        </p>
      ) : null}

      {row.attestation.inferenceReceiptId ? (
        <p className="receipt-upstream-attestation__meta">
          inference receipt:{' '}
          <a
            className="upstream-tee-panel__link"
            href={`/api/v1/inference/receipts/${encodeURIComponent(row.attestation.inferenceReceiptId)}`}
            rel="noreferrer"
            target="_blank"
          >
            {row.attestation.inferenceReceiptId}
          </a>
        </p>
      ) : null}

      {tee?.explorerUrl ? (
        <a
          className="upstream-tee-panel__link"
          href={tee.explorerUrl}
          rel="noreferrer"
          target="_blank"
        >
          open upstream proof explorer
        </a>
      ) : null}
    </article>
  );
}

export function ReceiptUpstreamAttestationPanel({
  rows,
  privacyMode,
  overallPassed,
  overallScore,
}: ReceiptUpstreamAttestationPanelProps) {
  if (rows.length === 0) {
    return (
      <p className="receipt-panel__muted">
        No upstream privacy attestations were recorded for this raid.
      </p>
    );
  }

  return (
    <div className="receipt-upstream-attestation">
      {privacyMode && privacyMode !== 'off' ? (
        <p className="receipt-upstream-attestation__summary">
          privacy mode: {privacyMode}
          {overallPassed != null ? ` · overall ${overallPassed ? 'passed' : 'failed'}` : ''}
          {overallScore != null ? ` · score ${overallScore}` : ''}
        </p>
      ) : null}
      <div className="receipt-upstream-attestation__list">
        {rows.map((row) => (
          <ReceiptUpstreamAttestationCard key={row.providerId} row={row} />
        ))}
      </div>
    </div>
  );
}
