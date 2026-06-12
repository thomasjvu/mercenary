import { countProvidersWithSignal, uniqueStrings } from '@bossraid/proof-ui';
import type { Provider, RaidResult } from '../api';

export function buildReceiptSettlementView(input: {
  result: RaidResult | undefined;
  providers: Provider[] | undefined;
}) {
  const approvedProviders = uniqueStrings(
    input.result?.settlementExecution?.successfulProviderIds.length
      ? input.result.settlementExecution.successfulProviderIds
      : input.result?.synthesizedOutput?.contributingProviderIds.length
        ? input.result.synthesizedOutput.contributingProviderIds
        : (input.result?.approvedSubmissions ?? []).map(
            (submission) => submission.submission.providerId
          )
  );
  const supportingProviders = uniqueStrings(
    (input.result?.synthesizedOutput?.supportingProviderIds ?? []).filter(
      (providerId) => !approvedProviders.includes(providerId)
    )
  );
  const droppedProviders = uniqueStrings(input.result?.synthesizedOutput?.droppedProviderIds ?? []);
  const settlementExecution = input.result?.settlementExecution;
  const routingProof = input.result?.routingProof;
  const routingDecisions = routingProof?.providers ?? [];
  const routingDecisionMap = new Map<
    string,
    NonNullable<RaidResult['routingProof']>['providers']
  >();

  for (const decision of routingDecisions) {
    const existing = routingDecisionMap.get(decision.providerId) ?? [];
    existing.push(decision);
    routingDecisionMap.set(decision.providerId, existing);
  }

  const routedProviderIds = uniqueStrings([
    ...routingDecisions.map((decision) => decision.providerId),
    ...approvedProviders,
    ...supportingProviders,
    ...droppedProviders,
    ...(settlementExecution?.childJobs.map((job) => job.providerId) ?? []),
  ]);

  return {
    approvedProviders,
    supportingProviders,
    droppedProviders,
    settlementExecution,
    routingProof,
    routingDecisionMap,
    routedProviderIds,
    erc8004ProviderCount: countProvidersWithSignal(
      routingDecisionMap,
      (decision) => decision.erc8004Registered
    ),
    verifiedErc8004ProviderCount: countProvidersWithSignal(
      routingDecisionMap,
      (decision) => decision.erc8004VerificationStatus === 'verified'
    ),
    veniceProviderCount: countProvidersWithSignal(
      routingDecisionMap,
      (decision) => decision.veniceBacked
    ),
    teeProviderCount: countProvidersWithSignal(routingDecisionMap, (decision) =>
      decision.privacyFeatures.includes('tee_attested')
    ),
    signedProviderCount: countProvidersWithSignal(routingDecisionMap, (decision) =>
      decision.privacyFeatures.includes('signed_outputs')
    ),
    approvedSubmissionCount: input.result?.approvedSubmissions?.length ?? approvedProviders.length,
    successfulProviderCount:
      input.result?.settlement?.successfulProviderCount ??
      settlementExecution?.successfulProviderIds.length ??
      approvedProviders.length,
    payoutPerSuccessfulProvider: input.result?.settlement?.payoutPerSuccessfulProvider,
    settlementWarnings: settlementExecution?.warnings ?? [],
    reputationEvents: input.result?.reputationEvents ?? [],
    providerMap: new Map(
      (input.providers ?? []).map((provider) => [provider.providerId, provider])
    ),
  };
}
