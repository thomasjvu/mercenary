import type { PrivacyAttestationView } from '@bossraid/shared-types';
import type { Provider, RaidResult } from '../api';

export type ReceiptUpstreamAttestationRow = {
  providerId: string;
  displayName: string;
  attestation: PrivacyAttestationView;
  settlementPassed?: boolean;
  settlementScore?: number;
};

function collectSubmissionAttestations(result: RaidResult | undefined): PrivacyAttestationView[] {
  const submissions = [
    ...(result?.approvedSubmissions ?? []),
    ...(result?.rankedSubmissions ?? []),
    ...(result?.primarySubmission ? [result.primarySubmission] : []),
  ];

  const byProvider = new Map<string, PrivacyAttestationView>();
  for (const entry of submissions) {
    const attestation = entry.submission.privacyAttestation;
    if (!attestation) {
      continue;
    }
    const existing = byProvider.get(attestation.providerId);
    if (!existing || (!existing.teeAttestation && attestation.teeAttestation)) {
      byProvider.set(attestation.providerId, attestation);
    }
  }

  return [...byProvider.values()];
}

export function buildReceiptUpstreamAttestations(input: {
  result: RaidResult | undefined;
  providers: Provider[] | undefined;
}): ReceiptUpstreamAttestationRow[] {
  const providerMap = new Map(
    (input.providers ?? []).map((provider) => [provider.providerId, provider])
  );
  const compliance = input.result?.settlementExecution?.privacyCompliance;
  const attestations = new Map<string, PrivacyAttestationView>();

  for (const attestation of compliance?.providerAttestations ?? []) {
    attestations.set(attestation.providerId, attestation);
  }

  for (const attestation of collectSubmissionAttestations(input.result)) {
    const existing = attestations.get(attestation.providerId);
    if (!existing || (!existing.teeAttestation && attestation.teeAttestation)) {
      attestations.set(attestation.providerId, attestation);
    }
  }

  return [...attestations.values()]
    .sort((left, right) => left.providerId.localeCompare(right.providerId))
    .map((attestation) => {
      const providerCompliance = compliance?.perProviderCompliance?.[attestation.providerId];
      return {
        providerId: attestation.providerId,
        displayName: providerMap.get(attestation.providerId)?.displayName ?? attestation.providerId,
        attestation,
        settlementPassed: providerCompliance?.passed,
        settlementScore: providerCompliance?.score,
      };
    });
}

export function formatPrivacyFeatureLabel(feature: string): string {
  return feature.replaceAll('_', ' ');
}
