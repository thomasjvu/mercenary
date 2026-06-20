import { ReceiptProofPanel } from '@bossraid/ui';
import type { AttestedEnvelope, AttestedRaidResultPayload, RaidResult } from '../../api';
import type { HostAttestationResponse } from '../../api/host-attestation.js';
import type { ReceiptUpstreamAttestationRow } from '../../lib/receipt-attestation-view';
import {
  buildAgentLogUrl,
  buildAgentManifestUrl,
  buildAttestedResultUrl,
  buildHostAttestationUrl,
  type ReceiptQuery,
} from '../../lib/receipt-url';
import { useAttestationInspector } from '../../contexts/AttestationInspectorContext.js';
import { ReceiptUpstreamAttestationPanel } from './ReceiptUpstreamAttestationPanel';

type ReceiptAttestationSectionProps = {
  activeQuery: ReceiptQuery;
  attestationTarget: string;
  attestationTee: string;
  attestationSurfaceLabel: string;
  runtimeAttestationStatus: string;
  resultAttestationStatus: string;
  runtimeSignerDisabled: boolean;
  resultSignerDisabled: boolean;
  hostAttestation: HostAttestationResponse | undefined;
  attestedResult: AttestedEnvelope<AttestedRaidResultPayload> | undefined;
  routedProviderCount: number;
  signedProviderCount: number;
  teeProviderCount: number;
  settlementExecution: RaidResult['settlementExecution'];
  upstreamAttestations: ReceiptUpstreamAttestationRow[];
  compact?: boolean;
};

export function ReceiptAttestationSection({
  activeQuery,
  attestationTarget,
  attestationTee,
  attestationSurfaceLabel,
  runtimeAttestationStatus,
  resultAttestationStatus,
  runtimeSignerDisabled,
  resultSignerDisabled,
  hostAttestation,
  attestedResult,
  routedProviderCount,
  signedProviderCount,
  teeProviderCount,
  settlementExecution,
  upstreamAttestations,
  compact = false,
}: ReceiptAttestationSectionProps) {
  const { openInspector } = useAttestationInspector();
  const privacyCompliance = settlementExecution?.privacyCompliance;
  return (
    <article className={`receipt-surface${compact ? ' receipt-surface--compact' : ''}`}>
      {!compact ? (
        <div className="receipt-surface__head">
          <div>
            <p className="eyebrow">proof</p>
            <h2>Attestation</h2>
          </div>
        </div>
      ) : null}
      <ReceiptProofPanel
        attestationTarget={attestationTarget}
        attestationTee={attestationTee}
        links={[
          {
            href: buildHostAttestationUrl(),
            label: 'host attestation',
            note: `${attestationSurfaceLabel} host proof`,
          },
          {
            href: buildAttestedResultUrl(activeQuery),
            label: 'result attestation',
            note: `${attestationSurfaceLabel} result proof`,
          },
          {
            href: buildAgentLogUrl(activeQuery),
            label: 'agent log',
            note: 'token-gated run log',
          },
          {
            href: buildAgentManifestUrl(),
            label: 'Mercenary manifest',
            note: 'public orchestrator manifest',
          },
        ]}
        messageHash={attestedResult?.messageHash}
        proofNote={
          <>
            <strong>TEE proof:</strong>{' '}
            {runtimeSignerDisabled || resultSignerDisabled
              ? 'Provider TEE and signed-output counts still reflect routed provider proofs. Host TEE quote is public; signed runtime/result envelopes require MNEMONIC.'
              : `${attestationSurfaceLabel} host proof and signed raid result proof are exposed here when the host signer is configured.`}
          </>
        }
        resultHash={attestedResult?.payload.resultHash ?? settlementExecution?.evaluationHash}
        resultStatus={resultAttestationStatus}
        routedProviderCount={routedProviderCount}
        runtimeSigner={hostAttestation?.signedRuntime?.signer}
        runtimeStatus={runtimeAttestationStatus}
        signedProviderCount={signedProviderCount}
        teeProviderCount={teeProviderCount}
      />
      {upstreamAttestations.length > 0 ? (
        <details className="receipt-disclosure receipt-disclosure--nested">
          <summary>upstream tee proof</summary>
          <div className="receipt-surface__section receipt-surface__section--nested">
            <div className="receipt-surface__section-head">
              <button
                className="button button--ghost"
                onClick={() =>
                  openInspector({
                    raidId: activeQuery.raidId,
                    upstreamAttestations,
                  })
                }
                type="button"
              >
                open inspector
              </button>
            </div>
            <ReceiptUpstreamAttestationPanel
              overallPassed={privacyCompliance?.overallPassed}
              overallScore={privacyCompliance?.overallScore}
              privacyMode={privacyCompliance?.privacyMode}
              rows={upstreamAttestations}
            />
          </div>
        </details>
      ) : null}
    </article>
  );
}
