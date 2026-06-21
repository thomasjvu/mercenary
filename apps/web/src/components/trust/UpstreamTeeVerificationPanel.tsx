import { useState } from 'react';
import type { UpstreamProviderId } from '@bossraid/constants';
import {
  verifyMarketplaceTeeAttestation,
  type TeeAttestationResponse,
} from '../../api/marketplace-tee.js';
import { useAttestationInspector } from '../../contexts/AttestationInspectorContext.js';
import { resolveTeeTrustLevel } from '../../lib/tee-trust-badge.js';
import { FormStatus } from '../system/FormField.js';
import { TeeTrustBadge } from './TeeTrustBadge.js';

type UpstreamTeeVerificationPanelProps = {
  provider: UpstreamProviderId;
  modelId: string;
  sellerId?: string;
  instanceId?: string;
  teeAttested?: boolean;
  e2ee?: boolean;
  compact?: boolean;
};

export function UpstreamTeeVerificationPanel({
  provider,
  modelId,
  sellerId,
  instanceId,
  teeAttested = false,
  e2ee = false,
  compact = false,
}: UpstreamTeeVerificationPanelProps) {
  const { openInspector } = useAttestationInspector();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TeeAttestationResponse | null>(null);

  async function handleVerify() {
    setPending(true);
    setError(null);
    try {
      const attestation = await verifyMarketplaceTeeAttestation({
        provider,
        modelId,
        sellerId,
        instanceId,
      });
      setResult(attestation);
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : 'TEE verification failed.');
      setResult(null);
    } finally {
      setPending(false);
    }
  }

  const className = compact
    ? 'upstream-tee-panel upstream-tee-panel--compact'
    : 'upstream-tee-panel';

  return (
    <section aria-label="Upstream TEE verification" className={className}>
      <div className="upstream-tee-panel__badges">
        <TeeTrustBadge
          level={resolveTeeTrustLevel({
            catalogTeeAttested: teeAttested,
            liveVerifyValid: result?.valid ?? null,
          })}
        />
        {e2ee ? <span className="trust-badge trust-badge--e2ee">e2ee</span> : null}
        <span className="upstream-tee-panel__vendor">{provider}</span>
      </div>

      <div className="upstream-tee-panel__actions">
        <button
          className="button button--ghost"
          disabled={pending}
          onClick={() => void handleVerify()}
          type="button"
        >
          {pending ? 'verifying...' : 'verify tee'}
        </button>
        <button
          className="button button--ghost"
          onClick={() => openInspector({ modelId, provider })}
          type="button"
        >
          view details
        </button>
      </div>

      {error ? <FormStatus tone="error">{error}</FormStatus> : null}

      {result ? (
        <div className="upstream-tee-panel__result">
          <p
            className={`upstream-tee-panel__status${result.valid ? ' upstream-tee-panel__status--ok' : ''}`}
          >
            {result.valid ? 'tee verified' : 'tee verification failed'}
          </p>
          {result.signingAddress ? (
            <p className="upstream-tee-panel__meta">signing address: {result.signingAddress}</p>
          ) : null}
          {result.e2eeReady ? <p className="upstream-tee-panel__meta">E2EE key ready</p> : null}
          {result.checks && result.checks.length > 0 ? (
            <ul className="upstream-tee-panel__checks">
              {result.checks.map((check) => (
                <li
                  className={
                    check.passed
                      ? 'upstream-tee-panel__check--pass'
                      : 'upstream-tee-panel__check--fail'
                  }
                  key={check.id}
                >
                  {check.passed ? '✓' : '✗'} {check.detail ?? check.id}
                </li>
              ))}
            </ul>
          ) : null}
          {result.explorerUrl ? (
            <a
              className="upstream-tee-panel__link"
              href={result.explorerUrl}
              rel="noreferrer"
              target="_blank"
            >
              open proof explorer
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
