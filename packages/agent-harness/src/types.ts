export type HarnessSubmission = {
  patchUnifiedDiff?: string;
  answerText?: string;
  explanation: string;
  confidence: number;
  claimedRootCause?: string | null;
  filesTouched: string[];
  harnessTrace: { steps: number; toolCalls: number };
};
