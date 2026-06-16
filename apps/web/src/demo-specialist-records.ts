import type {
  Provider,
  ProviderHealth,
  RaidAgentLog,
  RaidResult,
  RaidStatus as RaidStatusSnapshot,
} from './api';
import {
  formatLatency,
  formatProgress,
  humanizeStatus,
  humanizeToolCall,
  mapStatusTone,
  resolveSpecialistProgress,
  uniqueStrings,
} from './demo-format';
import { selectApprovedProviderIds } from './lib/raid-result-view.js';
import type {
  ConversationSpecialistRecord,
  SpecialistTraceRecord,
} from './demo-specialist-types.js';
import {
  buildProviderNote,
  buildProviderProofTags,
  buildToolCallTrace,
} from './demo-specialist-tags.js';

export function buildConversationSpecialistRecords(
  activeExperts: RaidStatusSnapshot['experts'],
  result: RaidResult | undefined,
  providerById: Map<string, Provider>,
  healthByProviderId: Map<string, ProviderHealth>
): ConversationSpecialistRecord[] {
  if (activeExperts.length > 0) {
    return activeExperts.map((expert) => {
      const provider = providerById.get(expert.providerId);
      const health = healthByProviderId.get(expert.providerId);
      const routingDecision = result?.routingProof?.providers.find(
        (entry) => entry.providerId === expert.providerId
      );
      const meta = [
        provider?.modelFamily ?? health?.model ?? '',
        formatProgress(expert.progress),
        formatLatency(expert.latencyMs),
      ]
        .filter((value): value is string => Boolean(value))
        .join(' • ');

      return {
        providerId: expert.providerId,
        displayName: provider?.displayName ?? health?.providerName ?? expert.providerId,
        statusLabel: humanizeStatus(expert.status),
        statusTone: mapStatusTone(expert.status),
        note: expert.message ?? buildProviderNote(provider, health),
        meta,
        progressValue: resolveSpecialistProgress(expert.status, expert.progress),
        proofTags: buildProviderProofTags(provider, routingDecision),
      };
    });
  }

  const routingProviders = result?.routingProof?.providers ?? [];
  if (routingProviders.length === 0) {
    return [];
  }

  const approvedProviderIds = new Set(selectApprovedProviderIds(result));
  const droppedProviderIds = new Set(result?.synthesizedOutput?.droppedProviderIds ?? []);
  const primaryProviders = routingProviders.some((entry) => entry.phase === 'primary')
    ? routingProviders.filter((entry) => entry.phase === 'primary')
    : routingProviders;

  return primaryProviders.map((entry) => {
    const provider = providerById.get(entry.providerId);
    const health = healthByProviderId.get(entry.providerId);
    const resolvedStatus = approvedProviderIds.has(entry.providerId)
      ? 'approved'
      : droppedProviderIds.has(entry.providerId)
        ? 'dropped'
        : entry.phase === 'reserve'
          ? 'reserve'
          : 'invited';
    const meta = [
      provider?.modelFamily ?? entry.modelFamily ?? health?.model ?? '',
      entry.matchedSpecializations.slice(0, 2).join(' / '),
    ]
      .filter((value): value is string => Boolean(value))
      .join(' • ');

    return {
      providerId: entry.providerId,
      displayName: provider?.displayName ?? health?.providerName ?? entry.providerId,
      statusLabel: humanizeStatus(resolvedStatus),
      statusTone: mapStatusTone(resolvedStatus),
      note:
        entry.roleLabel ??
        entry.workstreamLabel ??
        entry.reasons[0] ??
        buildProviderNote(provider, health),
      meta,
      progressValue: resolveSpecialistProgress(resolvedStatus),
      proofTags: buildProviderProofTags(provider, entry),
    };
  });
}

export function buildSpecialistTraceRecords(
  agentLog: RaidAgentLog | undefined,
  result: RaidResult | undefined,
  activeExperts: RaidStatusSnapshot['experts'],
  providerById: Map<string, Provider>,
  healthByProviderId: Map<string, ProviderHealth>
): SpecialistTraceRecord[] {
  const providerIds = uniqueStrings([
    ...activeExperts.map((expert) => expert.providerId),
    ...(result?.synthesizedOutput?.contributingProviderIds ?? []),
    ...(result?.synthesizedOutput?.droppedProviderIds ?? []),
    ...(agentLog?.workstreams.flatMap((workstream) => [
      ...workstream.providers,
      ...workstream.approvedProviders,
    ]) ?? []),
    ...(agentLog?.toolCalls.map((call) => call.target ?? '').filter((value) => value.length > 0) ??
      []),
    ...(agentLog?.failures
      .map((failure) => failure.providerId ?? '')
      .filter((value) => value.length > 0) ?? []),
  ]);

  return providerIds
    .map((providerId) => {
      const provider = providerById.get(providerId);
      const health = healthByProviderId.get(providerId);
      const expert = activeExperts.find((entry) => entry.providerId === providerId);
      const routingDecision = result?.routingProof?.providers.find(
        (entry) => entry.providerId === providerId
      );
      const contribution = result?.synthesizedOutput?.contributions.find(
        (entry) => entry.providerId === providerId
      );
      const approvedSubmission = result?.approvedSubmissions?.find(
        (entry) => entry.submission.providerId === providerId
      );
      const workstream = agentLog?.workstreams.find(
        (entry) =>
          entry.providers.includes(providerId) || entry.approvedProviders.includes(providerId)
      );
      const dropped = result?.synthesizedOutput?.droppedProviderIds.includes(providerId) ?? false;
      const approved =
        result?.synthesizedOutput?.contributingProviderIds.includes(providerId) ?? false;
      const resolvedStatus =
        expert?.status ??
        (approved ? 'approved' : dropped ? 'dropped' : (workstream?.status ?? 'invited'));
      const outcome = approvedSubmission?.breakdown.summary ?? expert?.message ?? '';
      const scope =
        [
          workstream?.workstreamLabel,
          workstream?.roleLabel,
          routingDecision?.roleLabel ?? contribution?.roleLabel,
        ]
          .filter((value): value is string => Boolean(value))
          .join(' / ') || buildProviderNote(provider, health);

      const events = [
        ...(agentLog?.toolCalls
          .filter((call) => call.target === providerId)
          .map((call, index) => ({
            id: `${providerId}:${call.tool}:${call.at}:${index}`,
            at: call.at,
            label: humanizeToolCall(call.tool),
            note: buildToolCallTrace(call),
          })) ?? []),
        ...(agentLog?.failures
          .filter((failure) => failure.providerId === providerId)
          .map((failure, index) => ({
            id: `${providerId}:failure:${failure.at}:${index}`,
            at: failure.at,
            label: humanizeStatus(failure.stage),
            note: failure.summary,
          })) ?? []),
      ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));

      if (events.length === 0 && !outcome) {
        return null;
      }

      return {
        providerId,
        displayName: provider?.displayName ?? health?.providerName ?? providerId,
        statusLabel: humanizeStatus(resolvedStatus),
        statusTone: mapStatusTone(resolvedStatus),
        scope,
        outcome,
        events,
      };
    })
    .filter((trace): trace is SpecialistTraceRecord => trace != null);
}

export function buildHostedSpecialistRecords(
  providers: Provider[],
  providerHealth: ProviderHealth[],
  healthByProviderId: Map<string, ProviderHealth>
): ConversationSpecialistRecord[] {
  if (providers.length === 0) {
    return providerHealth.map((entry) => ({
      providerId: entry.providerId,
      displayName: entry.providerName ?? entry.providerId,
      statusLabel: entry.ready ? 'ready' : entry.reachable ? 'reachable' : 'offline',
      statusTone: entry.ready ? 'ready' : entry.reachable ? 'available' : 'offline',
      note: entry.error ?? entry.endpoint ?? 'Waiting for provider metadata.',
      meta: entry.model ?? '',
      progressValue: null,
      proofTags: [],
    }));
  }

  return providers.map((provider) => {
    const health = healthByProviderId.get(provider.providerId);
    const statusLabel = health?.ready
      ? 'ready'
      : health?.reachable
        ? 'reachable'
        : humanizeStatus(provider.status || 'available');
    const statusTone = health?.ready
      ? 'ready'
      : health?.reachable
        ? 'available'
        : provider.status === 'offline'
          ? 'offline'
          : 'available';

    return {
      providerId: provider.providerId,
      displayName: provider.displayName,
      statusLabel,
      statusTone,
      note: buildProviderNote(provider, health),
      meta: provider.modelFamily ?? health?.model ?? '',
      progressValue: null,
      proofTags: buildProviderProofTags(provider),
    };
  });
}
