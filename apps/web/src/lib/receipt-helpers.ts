import {
  buildProviderProofNote,
  buildRoutingReasonNote,
  isRenderableImageArtifact,
  isRenderableVideoArtifact,
  matchRoutingDecision,
  truncateText,
} from '@bossraid/proof-ui';
import type { Provider, RaidResult } from '../api';

export type RoutingDecision = NonNullable<RaidResult['routingProof']>['providers'][number];
export type SubmissionArtifact = NonNullable<
  NonNullable<RaidResult['synthesizedOutput']>['artifacts']
>[number];
export type ReceiptProviderRowData = {
  providerId: string;
  displayName: string;
  state: string;
  assignment: string;
  proof: string;
  reason: string;
};

export const compactText = truncateText;

export function pickPreviewArtifacts(artifacts: SubmissionArtifact[]): SubmissionArtifact[] {
  return artifacts
    .filter(
      (artifact) => isRenderableImageArtifact(artifact) || isRenderableVideoArtifact(artifact)
    )
    .slice(0, 1);
}

export function summarizeCanonicalOutput(result: RaidResult | undefined): string {
  if (!result) {
    return 'Loading receipt proof.';
  }

  const summary =
    result.synthesizedOutput?.answerText ??
    result.synthesizedOutput?.explanation ??
    result.primarySubmission?.submission.answerText ??
    result.primarySubmission?.submission.explanation;

  if (summary && summary.trim().length > 0) {
    return compactText(summary, 220);
  }

  if (
    result.synthesizedOutput?.patchUnifiedDiff ||
    result.primarySubmission?.submission.patchUnifiedDiff
  ) {
    return 'Patch-backed result is ready. Open the agent log for the full run trace and the attested result for the signed proof payload.';
  }

  return 'Waiting for an approved canonical output.';
}

export function buildReceiptProviderRows(
  providerIds: string[],
  routingDecisionMap: Map<string, RoutingDecision[]>,
  providerMap: Map<string, Provider>,
  approvedProviders: string[],
  supportingProviders: string[],
  droppedProviders: string[]
): ReceiptProviderRowData[] {
  return providerIds.map((providerId) => {
    const provider = providerMap.get(providerId);
    const decision = matchRoutingDecision(routingDecisionMap.get(providerId));
    const state = approvedProviders.includes(providerId)
      ? 'approved'
      : supportingProviders.includes(providerId)
        ? 'supporting'
        : droppedProviders.includes(providerId)
          ? 'dropped'
          : 'routed';

    return {
      providerId,
      displayName: provider?.displayName ?? providerId,
      state,
      assignment:
        [decision?.workstreamLabel, decision?.roleLabel]
          .filter((value): value is string => Boolean(value))
          .join(' / ') || 'routed provider',
      proof: compactText(buildProviderProofNote(decision, provider), 72),
      reason: compactText(buildRoutingReasonNote(decision), 96),
    };
  });
}

export function readQueryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.';
}
