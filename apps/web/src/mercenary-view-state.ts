import type { AttestedEnvelope, AttestedRuntimePayload, Provider, ProviderHealth } from './api';
import { formatElapsedMs, humanizeStatus, isTerminalRaidStatus } from './mercenary-format';
import { MERCENARY_PROMPTS, type LiveRaidRun } from './mercenary-result';
import { deriveRuntimeAttestationStatus } from './lib/runtime-attestation-status.js';
import {
  buildConversationSpecialistRecords,
  buildHostedSpecialistRecords,
  buildSpecialistTraceRecords,
} from './mercenary-specialist-records.js';
import { countProofTag, countTeeAttestedSpecialists } from './mercenary-specialist-tags.js';
import {
  selectArtifacts,
  selectChatCompletionText,
  selectResultExplanation,
  selectResultPatch,
  selectResultText,
} from './lib/raid-result-view.js';

type MercenaryRaidViewStateInput = {
  raidBrief: string;
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

export function buildMercenaryRaidViewState({
  raidBrief,
  isLaunching,
  lastSubmittedBrief,
  launchError,
  liveRaidRun,
  providers,
  providerHealth,
  runtimeAttestation,
  runtimeAttestationError,
  paymentEnabled,
}: MercenaryRaidViewStateInput) {
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
  const canLaunchLiveRaid =
    paymentEnabled && (providerHealth.length === 0 || readyProviderCount > 0);
  const canSendBrief = raidBrief.trim().length > 0 && !isLaunching && canLaunchLiveRaid;
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
  const runtimeAttestationView = deriveRuntimeAttestationStatus({
    data: runtimeAttestation,
    error: runtimeAttestationError,
  });
  const runtimeAttestationSignerDisabled = runtimeAttestationView.signerDisabled;
  const runtimeAttestationStatus = runtimeAttestationView.status;
  const runtimeAttestationLabel = runtimeAttestationView.label;
  const runtimeAttestationTone = runtimeAttestationView.tone;
  const runtimeAttestationTarget = runtimeAttestationView.target;
  const runtimeAttestationTee = runtimeAttestationView.tee;
  const elapsedLabel = liveRaidRun
    ? formatElapsedMs(liveRaidRun.startedAtMs, liveRaidRun.completedAtMs)
    : 'n/a';
  const approvedSubmissionCount = liveRaidRun?.result?.approvedSubmissions?.length ?? 0;
  const teeAttestedSpecialistCount = countTeeAttestedSpecialists(sidebarSpecialists);
  const signedSpecialistCount = countProofTag(sidebarSpecialists, 'signed');
  const compactAvailabilityLabel =
    hostedProviderCount > 0 ? `${readyProviderCount}/${hostedProviderCount} ready` : 'checking';
  const specialistRosterCount = sidebarSpecialists.length || hostedProviderCount || 0;
  const activeSidebarSpecialists = sidebarSpecialists.filter(
    (specialist) => specialist.statusTone !== 'available' || specialist.progressValue != null
  );
  const highlightedSidebarSpecialists =
    liveRaidRun && !liveRaidRun.directResponse
      ? (activeSidebarSpecialists.length > 0 ? activeSidebarSpecialists : sidebarSpecialists).slice(
          0,
          4
        )
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
          { label: 'time', value: elapsedLabel },
          { label: 'route', value: 'direct' },
        ]
      : [
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
  const promptSuggestions = MERCENARY_PROMPTS;
  const conversationSignature = [
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
