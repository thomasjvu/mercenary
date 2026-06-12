import type { SubmissionArtifact } from '@bossraid/shared-types';
import { selectApprovedProviderIds as selectApprovedProviderIdsShared } from '@bossraid/proof-ui';
import type { ChatCompletionResponse, RaidResult } from '../api';

export function selectResultText(result: RaidResult | undefined): string | undefined {
  return result?.synthesizedOutput?.answerText ?? result?.primarySubmission?.submission.answerText;
}

export function selectChatCompletionText(
  chatCompletion: ChatCompletionResponse | undefined
): string | undefined {
  return chatCompletion?.choices[0]?.message?.content;
}

export function selectResultExplanation(result: RaidResult | undefined): string | undefined {
  return (
    result?.synthesizedOutput?.explanation ?? result?.primarySubmission?.submission.explanation
  );
}

export function selectResultPatch(result: RaidResult | undefined): string | undefined {
  return (
    result?.synthesizedOutput?.patchUnifiedDiff ??
    result?.primarySubmission?.submission.patchUnifiedDiff
  );
}

export function selectArtifacts(result: RaidResult | undefined): SubmissionArtifact[] {
  return (result?.synthesizedOutput?.artifacts ??
    result?.primarySubmission?.submission.artifacts ??
    []) as SubmissionArtifact[];
}

export function selectApprovedProviderIds(result: RaidResult | undefined): string[] {
  return selectApprovedProviderIdsShared(result);
}

export function selectPrimaryOutputType(result: RaidResult | undefined): string {
  return (
    result?.synthesizedOutput?.primaryType ??
    (result?.primarySubmission?.submission.patchUnifiedDiff ? 'patch' : 'pending')
  );
}

export function selectWorkstreams(result: RaidResult | undefined) {
  return result?.synthesizedOutput?.workstreams ?? [];
}

export function selectSynthesizedArtifacts(result: RaidResult | undefined): SubmissionArtifact[] {
  return (result?.synthesizedOutput?.artifacts ?? []) as SubmissionArtifact[];
}

export function selectCanonicalSummaryText(result: RaidResult | undefined): string | undefined {
  return (
    result?.synthesizedOutput?.answerText ??
    result?.synthesizedOutput?.explanation ??
    result?.primarySubmission?.submission.answerText ??
    result?.primarySubmission?.submission.explanation
  );
}
