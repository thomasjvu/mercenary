import type {
  AttestedEnvelope,
  AttestedRuntimePayload,
  Provider,
  ProviderHealth,
  RaidAgentLog,
  RaidResult,
  RaidStatus as RaidStatusSnapshot,
} from './api';
import type { SpecialistTone } from './components/demo/demo-ui';
import { isLowSignalChatPrompt } from './demo-chat.js';
import {
  formatElapsedMs,
  formatLatency,
  formatProgress,
  humanizeStatus,
  humanizeToolCall,
  isTerminalRaidStatus,
  mapStatusTone,
  resolveSpecialistProgress,
  uniqueStrings,
} from './demo-format';
import {
  buildDemoModeLabel,
  buildRuntimeAttestationLabel,
  CHAT_V1_DEMO_PROMPTS,
  isAttestationSignerUnavailable,
  RAID_DEMO_PROMPTS,
  selectApprovedProviderIds,
  selectArtifacts,
  selectChatCompletionText,
  selectResultExplanation,
  selectResultPatch,
  selectResultText,
  type DemoRequestMode,
  type LiveRaidRun,
} from './demo-result';

export type ConversationSpecialistRecord = {
  providerId: string;
  displayName: string;
  statusLabel: string;
  statusTone: SpecialistTone;
  note: string;
  meta: string;
  progressValue: number | null;
  proofTags: string[];
};

export type SpecialistTraceRecord = {
  providerId: string;
  displayName: string;
  statusLabel: string;
  statusTone: SpecialistTone;
  scope: string;
  outcome: string;
  events: Array<{
    id: string;
    at: string;
    label: string;
    note: string;
  }>;
};

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

export function buildProviderNote(
  provider: Provider | undefined,
  health: ProviderHealth | undefined
): string {
  if (provider?.specializations.length) {
    return provider.specializations.slice(0, 3).join(' / ');
  }

  return provider?.description ?? health?.error ?? health?.endpoint ?? 'Specialization pending.';
}

export function buildProviderProofTags(
  provider: Provider | undefined,
  routingDecision?: NonNullable<RaidResult['routingProof']>['providers'][number]
): string[] {
  const tags: string[] = [];
  const privacyFeatures = new Set<string>(routingDecision?.privacyFeatures ?? []);
  if (provider?.privacy?.teeAttested) {
    privacyFeatures.add('tee_attested');
  }
  if (provider?.privacy?.signedOutputs) {
    privacyFeatures.add('signed_outputs');
  }
  if (
    (routingDecision?.erc8004VerificationStatus ?? provider?.erc8004?.verification?.status) ===
    'verified'
  ) {
    tags.push('8004');
  }
  if (privacyFeatures.has('tee_attested')) {
    tags.push('TEE');
  }
  if (privacyFeatures.has('signed_outputs')) {
    tags.push('signed');
  }
  if (privacyFeatures.has('e2ee')) {
    tags.push('E2EE');
  }
  return uniqueStrings(tags).slice(0, 3);
}

export function buildToolCallTrace(call: RaidAgentLog['toolCalls'][number]): string {
  if (call.tool === 'provider_http_invite') {
    const workstream =
      typeof call.details?.workstream === 'string' ? call.details.workstream : null;
    const role = typeof call.details?.role === 'string' ? call.details.role : null;
    return (
      [workstream, role].filter((value): value is string => Boolean(value)).join(' / ') ||
      'Mercenary opened the assignment.'
    );
  }

  if (call.tool === 'provider_http_accept') {
    return typeof call.details?.providerRunId === 'string'
      ? `Run id ${call.details.providerRunId}.`
      : 'Specialist accepted the assignment.';
  }

  if (call.tool === 'provider_http_run') {
    const latency =
      typeof call.details?.latencyMs === 'number' && Number.isFinite(call.details.latencyMs)
        ? `${Math.round(call.details.latencyMs)}ms`
        : null;
    return latency ? `Specialist started execution. ${latency}.` : 'Specialist started execution.';
  }

  if (call.tool === 'evaluate_submission') {
    return 'Mercenary scored the submitted deliverable.';
  }

  return call.status;
}

export function countTeeAttestedSpecialists(specialists: ConversationSpecialistRecord[]): number {
  return specialists.filter((specialist) => specialist.proofTags.includes('TEE')).length;
}

export function countProofTag(specialists: ConversationSpecialistRecord[], tag: string): number {
  return specialists.filter((specialist) => specialist.proofTags.includes(tag)).length;
}

type RaidDemoViewStateInput = {
  demoMode: DemoRequestMode;
  liveDemoBrief: string;
  isLaunching: boolean;
  lastSubmittedBrief: string | null;
  launchError: string | null;
  liveRaidRun: LiveRaidRun | null;
  providers: Provider[];
  providerHealth: ProviderHealth[];
  runtimeAttestation: AttestedEnvelope<AttestedRuntimePayload> | null;
  runtimeAttestationError: string | null;
};

export function buildRaidDemoViewState({
  demoMode,
  liveDemoBrief,
  isLaunching,
  lastSubmittedBrief,
  launchError,
  liveRaidRun,
  providers,
  providerHealth,
  runtimeAttestation,
  runtimeAttestationError,
}: RaidDemoViewStateInput) {
  const providerById = new Map(providers.map((provider) => [provider.providerId, provider]));
  const healthByProviderId = new Map(providerHealth.map((entry) => [entry.providerId, entry]));
  const readyProviderCount = providerHealth.filter(
    (entry) => entry.reachable && entry.ready
  ).length;
  const hostedProviderCount = providerHealth.length > 0 ? providerHealth.length : providers.length;
  const availabilityLabel =
    hostedProviderCount > 0
      ? `${readyProviderCount}/${hostedProviderCount} specialists ready`
      : 'Checking specialists';
  const allowsDirectV1Reply = demoMode === 'chat_v1' && isLowSignalChatPrompt(liveDemoBrief);
  const canLaunchLiveRaid =
    providerHealth.length === 0 || readyProviderCount > 0 || allowsDirectV1Reply;
  const canSendBrief = liveDemoBrief.trim().length > 0 && !isLaunching && canLaunchLiveRaid;
  const activeRaidStatus = liveRaidRun?.status?.status ?? liveRaidRun?.spawn.status;
  const raidIsTerminal = activeRaidStatus ? isTerminalRaidStatus(activeRaidStatus) : false;
  const liveResultText =
    selectResultText(liveRaidRun?.result) ?? selectChatCompletionText(liveRaidRun?.chatCompletion);
  const liveExplanation = selectResultExplanation(liveRaidRun?.result);
  const livePatch = selectResultPatch(liveRaidRun?.result);
  const liveArtifacts = selectArtifacts(liveRaidRun?.result);
  const liveWorkstreams = liveRaidRun?.result?.synthesizedOutput?.workstreams ?? [];
  const activeExperts = liveRaidRun?.status?.experts ?? [];
  const specialistTraces = buildSpecialistTraceRecords(
    liveRaidRun?.agentLog,
    liveRaidRun?.result,
    activeExperts,
    providerById,
    healthByProviderId
  );
  const mercenaryDecisionTrace = liveRaidRun?.agentLog?.decisions ?? [];
  const conversationSpecialists = buildConversationSpecialistRecords(
    activeExperts,
    liveRaidRun?.result,
    providerById,
    healthByProviderId
  );
  const sidebarSpecialists =
    conversationSpecialists.length > 0
      ? conversationSpecialists
      : buildHostedSpecialistRecords(providers, providerHealth, healthByProviderId);
  const runtimeAttestationSignerDisabled = isAttestationSignerUnavailable(runtimeAttestationError);
  const runtimeAttestationStatus = runtimeAttestation
    ? 'live'
    : runtimeAttestationSignerDisabled
      ? 'proof unpublished'
      : runtimeAttestationError
        ? 'unavailable'
        : 'loading';
  const runtimeAttestationTarget =
    runtimeAttestation?.payload.deploymentTarget ??
    (runtimeAttestationSignerDisabled ? 'not published' : 'pending');
  const runtimeAttestationTee =
    runtimeAttestation?.payload.teePlatform ??
    (runtimeAttestationSignerDisabled ? 'provider TEE live' : 'pending');
  const runtimeAttestationLabel = runtimeAttestation
    ? buildRuntimeAttestationLabel(runtimeAttestationTarget, runtimeAttestationTee)
    : runtimeAttestationSignerDisabled
      ? 'Provider TEE live'
      : buildRuntimeAttestationLabel(runtimeAttestationTarget, runtimeAttestationTee);
  const runtimeAttestationTone: SpecialistTone = runtimeAttestation
    ? 'ready'
    : runtimeAttestationSignerDisabled
      ? 'available'
      : runtimeAttestationError
        ? 'offline'
        : 'working';
  const elapsedLabel = liveRaidRun
    ? formatElapsedMs(liveRaidRun.startedAtMs, liveRaidRun.completedAtMs)
    : 'n/a';
  const approvedSubmissionCount = liveRaidRun?.result?.approvedSubmissions?.length ?? 0;
  const teeAttestedSpecialistCount = countTeeAttestedSpecialists(sidebarSpecialists);
  const signedSpecialistCount = countProofTag(sidebarSpecialists, 'signed');
  const compactAvailabilityLabel =
    hostedProviderCount > 0 ? `${readyProviderCount}/${hostedProviderCount} ready` : 'checking';
  const specialistRosterCount = sidebarSpecialists.length || hostedProviderCount || 0;
  const highlightedSidebarSpecialists =
    liveRaidRun && !liveRaidRun.directResponse
      ? (sidebarSpecialists.filter(
          (specialist) => specialist.statusTone !== 'available' || specialist.progressValue != null
        ).length > 0
          ? sidebarSpecialists.filter(
              (specialist) =>
                specialist.statusTone !== 'available' || specialist.progressValue != null
            )
          : sidebarSpecialists
        ).slice(0, 4)
      : [];
  const traceEventCount =
    mercenaryDecisionTrace.length +
    specialistTraces.reduce((total, trace) => total + trace.events.length, 0);
  const showTracePanel = traceEventCount > 0;
  const showReceiptLinks = Boolean(
    liveRaidRun && !liveRaidRun.directResponse && raidIsTerminal && liveRaidRun.spawn.receiptPath
  );
  const showTraceLink = Boolean(liveRaidRun && !liveRaidRun.directResponse);
  const showResultProofLink = Boolean(
    liveRaidRun &&
    !liveRaidRun.directResponse &&
    raidIsTerminal &&
    liveRaidRun.spawn.raidAccessToken
  );
  const runtimeSummaryValue = runtimeAttestation
    ? runtimeAttestationTee
    : runtimeAttestationSignerDisabled
      ? 'provider TEE live'
      : runtimeAttestationStatus;
  const runSignals: Array<{ label: string; value: string }> = liveRaidRun
    ? liveRaidRun.directResponse
      ? [
          { label: 'mode', value: buildDemoModeLabel(liveRaidRun.requestMode) },
          { label: 'time', value: elapsedLabel },
          { label: 'route', value: 'direct' },
        ]
      : [
          { label: 'mode', value: buildDemoModeLabel(liveRaidRun.requestMode) },
          { label: 'time', value: elapsedLabel },
          { label: 'invited', value: String(liveRaidRun.spawn.selectedExperts) },
          {
            label: raidIsTerminal ? 'approved' : 'status',
            value: raidIsTerminal
              ? `${approvedSubmissionCount}/${liveRaidRun.spawn.selectedExperts}`
              : humanizeStatus(activeRaidStatus ?? 'queued'),
          },
        ]
    : [
        { label: 'mode', value: buildDemoModeLabel(demoMode) },
        { label: 'ready', value: compactAvailabilityLabel },
        { label: 'runtime', value: runtimeSummaryValue },
      ];
  const attestationSignals = [
    { label: 'runtime', value: runtimeSummaryValue },
    { label: 'target', value: runtimeAttestationTarget },
    { label: 'tee', value: `${teeAttestedSpecialistCount}/${specialistRosterCount}` },
    { label: 'sig', value: `${signedSpecialistCount}/${specialistRosterCount}` },
  ];
  const hasConversation = Boolean(lastSubmittedBrief || liveRaidRun || launchError);
  const promptSuggestions = demoMode === 'raid' ? RAID_DEMO_PROMPTS : CHAT_V1_DEMO_PROMPTS;
  const conversationSignature = [
    demoMode,
    lastSubmittedBrief ?? '',
    isLaunching ? 'launching' : 'idle',
    launchError ?? '',
    liveRaidRun?.spawn.raidId ?? '',
    activeRaidStatus ?? '',
    conversationSpecialists
      .map((specialist) => `${specialist.providerId}:${specialist.statusLabel}:${specialist.note}`)
      .join('|'),
    liveWorkstreams.map((workstream) => `${workstream.id}:${workstream.summary}`).join('|'),
    mercenaryDecisionTrace
      .map((decision) => `${decision.type}:${decision.status}:${decision.summary}`)
      .join('|'),
    specialistTraces
      .map((trace) => `${trace.providerId}:${trace.statusLabel}:${trace.events.length}`)
      .join('|'),
    liveResultText ?? '',
    liveExplanation ?? '',
    String(liveArtifacts.length),
    livePatch ?? '',
    liveRaidRun?.chatCompletion?.id ?? '',
  ].join('::');

  return {
    availabilityLabel,
    canLaunchLiveRaid,
    canSendBrief,
    activeRaidStatus,
    raidIsTerminal,
    liveResultText,
    liveExplanation,
    livePatch,
    liveArtifacts,
    specialistTraces,
    mercenaryDecisionTrace,
    sidebarSpecialists,
    runtimeAttestationSignerDisabled,
    runtimeAttestationStatus,
    runtimeAttestationTarget,
    runtimeAttestationTee,
    runtimeAttestationLabel,
    runtimeAttestationTone,
    elapsedLabel,
    highlightedSidebarSpecialists,
    traceEventCount,
    showTracePanel,
    showReceiptLinks,
    showTraceLink,
    showResultProofLink,
    runSignals,
    attestationSignals,
    hasConversation,
    promptSuggestions,
    conversationSignature,
    specialistRosterCount,
    compactAvailabilityLabel,
  };
}
