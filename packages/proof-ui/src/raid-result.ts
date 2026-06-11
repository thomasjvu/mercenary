import { uniqueStrings } from './format.js';

export type ApprovedProviderResultLike = {
  settlementExecution?: {
    successfulProviderIds?: string[];
  };
  synthesizedOutput?: {
    contributingProviderIds?: string[];
  };
  approvedSubmissions?: Array<{
    submission: {
      providerId: string;
    };
  }>;
};

export function selectApprovedProviderIds(
  result: ApprovedProviderResultLike | undefined
): string[] {
  if (!result) {
    return [];
  }

  if (result.settlementExecution?.successfulProviderIds?.length) {
    return uniqueStrings(result.settlementExecution.successfulProviderIds);
  }

  if (result.synthesizedOutput?.contributingProviderIds?.length) {
    return uniqueStrings(result.synthesizedOutput.contributingProviderIds);
  }

  return uniqueStrings(
    (result.approvedSubmissions ?? []).map((entry) => entry.submission.providerId)
  );
}
