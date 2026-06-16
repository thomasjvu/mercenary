import type { AttestedEnvelope, AttestedRuntimePayload, Provider, ProviderHealth } from './api';
import type { SpecialistTone } from './components/demo/demo-ui';
import { isLowSignalChatPrompt } from './demo-chat.js';
import { formatElapsedMs, humanizeStatus, isTerminalRaidStatus } from './demo-format';
import {
  buildDemoModeLabel,
  buildRuntimeAttestationLabel,
  CHAT_V1_DEMO_PROMPTS,
  isAttestationSignerUnavailable,
  RAID_DEMO_PROMPTS,
  type DemoRequestMode,
  type LiveRaidRun,
} from './demo-result';
import {
  buildConversationSpecialistRecords,
  buildHostedSpecialistRecords,
  buildSpecialistTraceRecords,
} from './demo-specialist-records.js';
import { countProofTag, countTeeAttestedSpecialists } from './demo-specialist-tags.js';
import {
  selectArtifacts,
  selectChatCompletionText,
  selectResultExplanation,
  selectResultPatch,
  selectResultText,
} from './lib/raid-result-view.js';

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
  paymentEnabled: boolean;
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
  paymentEnabled,
}: RaidDemoViewStateInput) {
  const providerById = new Map(providers.map((provider) => [provider.providerId, provider]));
  const healthByProviderId = new Map(providerHealth.map((entry) => [entry.providerId, entry]));
  const readyProviderCount = providerHealth.filter(
    (entry) => entry.reachable && entry.ready
  ).length;
  const hostedProviderCount = providerHealth.length > 0 ? providerHealth.length : providers.length;
  const availabilityLabel = !paymentEnabled
    ? 'Payment not configured'
    : hostedProviderCount > 0
      ? `${readyProviderCount}/${hostedProviderCount} specialists ready`
      : 'Checking specialists';
  const allowsDirectV1Reply = demoMode === 'chat_v1' && isLowSignalChatPrompt(liveDemoBrief);
  const canLaunchLiveRaid =
    paymentEnabled &&
    (providerHealth.length === 0 || readyProviderCount > 0 || allowsDirectV1Reply);
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
