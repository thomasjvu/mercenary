import { ReceiptProofPanel } from '@bossraid/ui';
import type {
  AttestedEnvelope,
  AttestedRaidResultPayload,
  AttestedRuntimePayload,
  RaidResult,
} from '../../api';
import {
  buildAgentLogUrl,
  buildAgentManifestUrl,
  buildAttestedResultUrl,
  buildAttestedRuntimeUrl,
  type ReceiptQuery,
} from '../../lib/receipt-url';

type ReceiptAttestationSectionProps = {
  activeQuery: ReceiptQuery;
  attestationTarget: string;
  attestationTee: string;
  attestationSurfaceLabel: string;
  runtimeAttestationStatus: string;
  resultAttestationStatus: string;
  runtimeSignerDisabled: boolean;
  resultSignerDisabled: boolean;
  attestedRuntime: AttestedEnvelope<AttestedRuntimePayload> | undefined;
  attestedResult: AttestedEnvelope<AttestedRaidResultPayload> | undefined;
  routedProviderCount: number;
  signedProviderCount: number;
  teeProviderCount: number;
  settlementExecution: RaidResult['settlementExecution'];
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
  attestedRuntime,
  attestedResult,
  routedProviderCount,
  signedProviderCount,
  teeProviderCount,
  settlementExecution,
}: ReceiptAttestationSectionProps) {
  return (
    <article className="receipt-surface">
      <div className="receipt-surface__head">
        <div>
          <p className="eyebrow">proof</p>
          <h2>Attestation</h2>
        </div>
      </div>
      <ReceiptProofPanel
        attestationTarget={attestationTarget}
        attestationTee={attestationTee}
        links={[
          {
            href: buildAttestedRuntimeUrl(),
            label: 'runtime attestation',
            note: `${attestationSurfaceLabel} runtime proof`,
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
              ? 'Provider TEE and signed-output counts still reflect routed provider proofs, but this host is not publishing signed runtime/result envelopes because MNEMONIC is not configured.'
              : `${attestationSurfaceLabel} runtime proof and signed raid result proof are exposed here when the host signer is configured.`}
          </>
        }
        resultHash={attestedResult?.payload.resultHash ?? settlementExecution?.evaluationHash}
        resultStatus={resultAttestationStatus}
        routedProviderCount={routedProviderCount}
        runtimeSigner={attestedRuntime?.signer}
        runtimeStatus={runtimeAttestationStatus}
        signedProviderCount={signedProviderCount}
        teeProviderCount={teeProviderCount}
      />
    </article>
  );
}
