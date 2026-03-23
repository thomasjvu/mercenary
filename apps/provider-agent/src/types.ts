import type { SubmissionArtifact } from "@bossraid/shared-types";
import type { ProviderTaskPackage } from "@bossraid/shared-types";

export type AcceptBody = {
  raidId: string;
  providerId: string;
  task: ProviderTaskPackage;
  deadlineUnix: number;
};

export type ModelSubmission = {
  patchUnifiedDiff?: string;
  answerText?: string;
  artifacts?: SubmissionArtifact[];
  explanation: string;
  confidence: number;
  claimedRootCause?: string | null;
  contributionRole?: {
    id: string;
    label: string;
    objective?: string;
    workstreamId?: string;
    workstreamLabel?: string;
    workstreamObjective?: string;
  };
  filesTouched: string[];
};

export type ResponsesApiPayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
      json?: unknown;
      refusal?: string;
    }>;
  }>;
  error?: {
    message?: string;
  };
};
