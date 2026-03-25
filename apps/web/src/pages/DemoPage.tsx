import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { SubmissionArtifact } from "@bossraid/shared-types";
import {
  API_BASE,
  fetchAttestedRuntime,
  fetchRaidAgentLog,
  fetchRaidResult,
  fetchRaidStatus,
  requestChatCompletion,
  spawnDemoRaid,
  type AttestedEnvelope,
  type AttestedRuntimePayload,
  type ChatCompletionResponse,
  type Provider,
  type RaidAgentLog,
  type ProviderHealth,
  type RaidResult,
  type RaidSpawnOutput,
  type RaidStatus as RaidStatusSnapshot,
} from "../api";
import { buildLiveDemoPayload } from "../default-payload";
import heroImage from "../../../../assets/hero.webp";

type SpecialistTone = "ready" | "available" | "offline" | "working";
type DemoRequestMode = "raid" | "chat_v1";

type DemoPageProps = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
};

type LiveRaidRun = {
  requestMode: DemoRequestMode;
  spawn: RaidSpawnOutput;
  directResponse?: boolean;
  chatCompletion?: ChatCompletionResponse;
  startedAtMs: number;
  completedAtMs?: number;
  status?: RaidStatusSnapshot;
  result?: RaidResult;
  agentLog?: RaidAgentLog;
  lastUpdatedAt?: string;
  pollError?: string | null;
};

type ConversationSpecialistRecord = {
  providerId: string;
  displayName: string;
  statusLabel: string;
  statusTone: SpecialistTone;
  note: string;
  meta: string;
  progressValue: number | null;
  proofTags: string[];
};

type BundleArtifactFile = {
  relativePath: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  uri: string;
};

type BundleArtifactPreview = {
  artifactId: string;
  files: BundleArtifactFile[];
};

type SpecialistTraceRecord = {
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

const LIVE_POLL_INTERVAL_MS = 3_000;
const TERMINAL_RAID_STATUSES = new Set(["final", "cancelled", "expired"]);
const V1_CHAT_MODEL = "gpt-4.1-mini";
const RAID_DEMO_PROMPTS = [
  "Hi Mercenary. What can you actually help me with here?",
  "How do you decide when a request needs specialists instead of a direct answer?",
  "Build a one-room GB Studio microgame with one boss, one key, one exit, and a matching 12-second trailer.",
] as const;
const CHAT_V1_DEMO_PROMPTS = [
  "Hi Mercenary. Give me a short intro to how this compatibility route works.",
  "Explain how v1 completions differs from the native raid path.",
  "Summarize how you would hire gameplay, art, and promo specialists for a small game launch.",
] as const;

export function DemoPage({ providers, providerHealth }: DemoPageProps) {
  const [demoMode, setDemoMode] = useState<DemoRequestMode>("raid");
  const [liveDemoBrief, setLiveDemoBrief] = useState("");
  const [lastSubmittedBrief, setLastSubmittedBrief] = useState<string | null>(null);
  const [liveRaidRun, setLiveRaidRun] = useState<LiveRaidRun | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [receiptCopied, setReceiptCopied] = useState(false);
  const [expandedArtifact, setExpandedArtifact] = useState<SubmissionArtifact | null>(null);
  const [runtimeAttestation, setRuntimeAttestation] = useState<AttestedEnvelope<AttestedRuntimePayload> | null>(null);
  const [runtimeAttestationError, setRuntimeAttestationError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const providerById = new Map(providers.map((provider) => [provider.providerId, provider]));
  const healthByProviderId = new Map(providerHealth.map((entry) => [entry.providerId, entry]));
  const readyProviderCount = providerHealth.filter((entry) => entry.reachable && entry.ready).length;
  const hostedProviderCount = providerHealth.length > 0 ? providerHealth.length : providers.length;
  const availabilityLabel =
    hostedProviderCount > 0 ? `${readyProviderCount}/${hostedProviderCount} specialists ready` : "Checking specialists";
  const canLaunchLiveRaid = providerHealth.length === 0 || readyProviderCount > 0;
  const canSendBrief = canLaunchLiveRaid && liveDemoBrief.trim().length > 0 && !isLaunching;
  const activeRaidStatus = liveRaidRun?.status?.status ?? liveRaidRun?.spawn.status;
  const raidIsTerminal = activeRaidStatus ? isTerminalRaidStatus(activeRaidStatus) : false;
  const liveResultText = selectResultText(liveRaidRun?.result) ?? selectChatCompletionText(liveRaidRun?.chatCompletion);
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
    healthByProviderId,
  );
  const mercenaryDecisionTrace = liveRaidRun?.agentLog?.decisions ?? [];
  const conversationSpecialists = buildConversationSpecialistRecords(
    activeExperts,
    liveRaidRun?.result,
    providerById,
    healthByProviderId,
  );
  const sidebarSpecialists =
    conversationSpecialists.length > 0
      ? conversationSpecialists
      : buildHostedSpecialistRecords(providers, providerHealth, healthByProviderId);
  const runtimeAttestationSignerDisabled = isAttestationSignerUnavailable(runtimeAttestationError);
  const runtimeAttestationStatus = runtimeAttestation
    ? "live"
    : runtimeAttestationSignerDisabled
      ? "signer off"
      : runtimeAttestationError
        ? "unavailable"
        : "loading";
  const runtimeAttestationTarget = runtimeAttestation?.payload.deploymentTarget ?? (runtimeAttestationSignerDisabled ? "not published" : "pending");
  const runtimeAttestationTee = runtimeAttestation?.payload.teePlatform ?? (runtimeAttestationSignerDisabled ? "unsigned" : "pending");
  const runtimeAttestationLabel = runtimeAttestation
    ? buildRuntimeAttestationLabel(runtimeAttestationTarget, runtimeAttestationTee)
    : runtimeAttestationSignerDisabled
      ? "Runtime proof not published"
      : buildRuntimeAttestationLabel(runtimeAttestationTarget, runtimeAttestationTee);
  const elapsedLabel = liveRaidRun ? formatElapsedMs(liveRaidRun.startedAtMs, liveRaidRun.completedAtMs) : "n/a";
  const teeAttestedSpecialistCount = countTeeAttestedSpecialists(sidebarSpecialists);
  const signedSpecialistCount = countProofTag(sidebarSpecialists, "signed");
  const compactAvailabilityLabel = hostedProviderCount > 0 ? `${readyProviderCount}/${hostedProviderCount} ready` : "checking";
  const specialistRosterCount = sidebarSpecialists.length || hostedProviderCount || 0;
  const highlightedSidebarSpecialists = liveRaidRun && !liveRaidRun.directResponse
    ? (
        sidebarSpecialists.filter((specialist) => specialist.statusTone !== "available" || specialist.progressValue != null).length > 0
          ? sidebarSpecialists.filter((specialist) => specialist.statusTone !== "available" || specialist.progressValue != null)
          : sidebarSpecialists
      ).slice(0, 4)
    : [];
  const traceEventCount =
    mercenaryDecisionTrace.length + specialistTraces.reduce((total, trace) => total + trace.events.length, 0);
  const showTracePanel = traceEventCount > 0;
  const showReceiptLinks = Boolean(liveRaidRun && !liveRaidRun.directResponse && raidIsTerminal && liveRaidRun.spawn.receiptPath);
  const showTraceLink = Boolean(liveRaidRun && !liveRaidRun.directResponse);
  const showResultProofLink = Boolean(liveRaidRun && !liveRaidRun.directResponse && raidIsTerminal && liveRaidRun.spawn.raidAccessToken);
  const runtimeSummaryValue = runtimeAttestation
    ? runtimeAttestationTee
    : runtimeAttestationSignerDisabled
      ? "signer off"
      : runtimeAttestationStatus;
  const runSignals: Array<{ label: string; value: string }> = liveRaidRun
    ? liveRaidRun.directResponse
      ? [
          { label: "mode", value: buildDemoModeLabel(liveRaidRun.requestMode) },
          { label: "time", value: elapsedLabel },
          { label: "route", value: "direct" },
        ]
      : [
          { label: "mode", value: buildDemoModeLabel(liveRaidRun.requestMode) },
          { label: "time", value: elapsedLabel },
          { label: "invited", value: String(liveRaidRun.spawn.selectedExperts) },
          {
            label: raidIsTerminal ? "outputs" : "status",
            value: raidIsTerminal ? `${liveWorkstreams.length}/${liveArtifacts.length}` : humanizeStatus(activeRaidStatus ?? "queued"),
          },
        ]
    : [
        { label: "mode", value: buildDemoModeLabel(demoMode) },
        { label: "ready", value: compactAvailabilityLabel },
        { label: "runtime", value: runtimeSummaryValue },
      ];
  const attestationSignals = [
    { label: "runtime", value: runtimeSummaryValue },
    { label: "target", value: runtimeAttestationTarget },
    { label: "tee", value: `${teeAttestedSpecialistCount}/${specialistRosterCount}` },
    { label: "sig", value: `${signedSpecialistCount}/${specialistRosterCount}` },
  ];
  const hasConversation = Boolean(lastSubmittedBrief || liveRaidRun || launchError);
  const promptSuggestions = demoMode === "raid" ? RAID_DEMO_PROMPTS : CHAT_V1_DEMO_PROMPTS;
  const conversationSignature = [
    demoMode,
    lastSubmittedBrief ?? "",
    isLaunching ? "launching" : "idle",
    launchError ?? "",
    liveRaidRun?.spawn.raidId ?? "",
    activeRaidStatus ?? "",
    conversationSpecialists.map((specialist) => `${specialist.providerId}:${specialist.statusLabel}:${specialist.note}`).join("|"),
    liveWorkstreams.map((workstream) => `${workstream.id}:${workstream.summary}`).join("|"),
    mercenaryDecisionTrace.map((decision) => `${decision.type}:${decision.status}:${decision.summary}`).join("|"),
    specialistTraces.map((trace) => `${trace.providerId}:${trace.statusLabel}:${trace.events.length}`).join("|"),
    liveResultText ?? "",
    liveExplanation ?? "",
    String(liveArtifacts.length),
    livePatch ?? "",
    liveRaidRun?.chatCompletion?.id ?? "",
  ].join("::");

  useEffect(() => {
    if (!receiptCopied) {
      return;
    }

    const timer = window.setTimeout(() => setReceiptCopied(false), 1_200);
    return () => window.clearTimeout(timer);
  }, [receiptCopied]);

  useEffect(() => {
    let cancelled = false;

    void fetchAttestedRuntime()
      .then((response) => {
        if (cancelled) {
          return;
        }
        setRuntimeAttestation(response);
        setRuntimeAttestationError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setRuntimeAttestation(null);
        setRuntimeAttestationError(readErrorMessage(error));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!liveRaidRun || raidIsTerminal || liveRaidRun.directResponse) {
      return;
    }

    const spawn = liveRaidRun.spawn;
    const pollTimer = window.setInterval(() => {
      void refreshLiveRaid(spawn);
    }, LIVE_POLL_INTERVAL_MS);

    return () => window.clearInterval(pollTimer);
  }, [liveRaidRun?.spawn.raidId, raidIsTerminal]);

  useEffect(() => {
    const thread = threadRef.current;
    if (!thread) {
      return;
    }

    thread.scrollTo({
      top: thread.scrollHeight,
      behavior: "smooth",
    });
  }, [conversationSignature]);

  useEffect(() => {
    if (!expandedArtifact) {
      return;
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setExpandedArtifact(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [expandedArtifact]);

  async function launchConversation() {
    const submittedBrief = liveDemoBrief.trim();
    if (!submittedBrief || isLaunching || !canLaunchLiveRaid) {
      return;
    }
    const startedAtMs = Date.now();

    setIsLaunching(true);
    setLaunchError(null);
    setLastSubmittedBrief(submittedBrief);
    setLiveRaidRun(null);
    setReceiptCopied(false);

    try {
      const response =
        demoMode === "raid"
          ? await spawnDemoRaid(buildLiveDemoPayload(submittedBrief))
          : await requestChatCompletion(buildDemoChatCompletionPayload(submittedBrief));
      if (!response.ok || !response.data) {
        if (response.status === 404) {
          throw new Error(
            demoMode === "raid"
              ? "Free demo raid is not enabled on this host. The paid native route stays at POST /v1/raid."
              : "The v1 chat-completions route is not enabled on this host.",
          );
        }

        if (response.status === 401) {
          throw new Error(
            demoMode === "raid"
              ? "Free demo raid is enabled, but the proxy is missing a valid demo token."
              : "The v1 chat-completions route rejected the request.",
          );
        }

        if ((response.error ?? "").toLowerCase().includes("payment required")) {
          throw new Error(
            "This host sent /demo to the paid lane. The paid native route stays at POST /v1/raid.",
          );
        }

        throw new Error(response.error ?? `Raid launch failed with status ${response.status}.`);
      }

      const chatCompletion = demoMode === "chat_v1" ? (response.data as ChatCompletionResponse) : undefined;
      const directResponse = demoMode === "chat_v1" && !chatCompletion?.raid;
      const spawn =
        demoMode === "raid"
          ? (response.data as RaidSpawnOutput)
          : buildSpawnFromChatCompletion(chatCompletion ?? null) ?? buildDirectChatSpawn(chatCompletion);

      setLiveRaidRun({
        requestMode: demoMode,
        spawn,
        directResponse,
        chatCompletion,
        startedAtMs,
        lastUpdatedAt: new Date().toISOString(),
        pollError: null,
      });

      if (!directResponse) {
        await refreshLiveRaid(spawn);
      }
    } catch (error) {
      setLaunchError(readErrorMessage(error));
    } finally {
      setIsLaunching(false);
    }
  }

  async function refreshLiveRaid(spawn: RaidSpawnOutput) {
    const [statusResult, resultResult, agentLogResult] = await Promise.allSettled([
      fetchRaidStatus(spawn.raidId, spawn.raidAccessToken),
      fetchRaidResult(spawn.raidId, spawn.raidAccessToken),
      fetchRaidAgentLog(spawn.raidId, spawn.raidAccessToken),
    ]);

    setLiveRaidRun((current) => {
      if (!current || current.spawn.raidId !== spawn.raidId) {
        return current;
      }

      const nextStatus = statusResult.status === "fulfilled" ? statusResult.value : current.status;
      const nextResult = resultResult.status === "fulfilled" ? resultResult.value : current.result;
      const nextAgentLog = agentLogResult.status === "fulfilled" ? agentLogResult.value : current.agentLog;
      const nextRaidStatus = nextStatus?.status ?? current.spawn.status;
      const pollError =
        statusResult.status === "rejected"
          ? readErrorMessage(statusResult.reason)
          : resultResult.status === "rejected" && isTerminalRaidStatus(nextRaidStatus)
            ? readErrorMessage(resultResult.reason)
            : null;

      return {
        ...current,
        completedAtMs: current.completedAtMs ?? (isTerminalRaidStatus(nextRaidStatus) ? Date.now() : undefined),
        status: nextStatus,
        result: nextResult,
        agentLog: nextAgentLog,
        lastUpdatedAt: new Date().toISOString(),
        pollError,
      };
    });
  }

  async function copyReceiptLink() {
    if (!liveRaidRun || !liveRaidRun.spawn.receiptPath) {
      return;
    }

    try {
      await navigator.clipboard.writeText(buildAbsolutePath(liveRaidRun.spawn.receiptPath));
      setReceiptCopied(true);
    } catch {
      setReceiptCopied(false);
    }
  }

  function resetConversation() {
    if (isLaunching) {
      return;
    }

    setLiveDemoBrief("");
    setLastSubmittedBrief(null);
    setLiveRaidRun(null);
    setLaunchError(null);
    setReceiptCopied(false);
    setExpandedArtifact(null);
  }

  function handleModeChange(nextMode: DemoRequestMode) {
    if (isLaunching || nextMode === demoMode) {
      return;
    }

    setDemoMode(nextMode);
    setLastSubmittedBrief(null);
    setLiveRaidRun(null);
    setLaunchError(null);
    setReceiptCopied(false);
    setExpandedArtifact(null);
  }

  function handleComposerKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void launchConversation();
  }

  return (
    <section className="mercenary-demo" id="demo">
      <article className="mercenary-chat">
        <div className="mercenary-chat__topbar">
          <div className="mercenary-chat__identity">
            <strong>Mercenary</strong>
            <span>
              {`${buildDemoModeLabel(demoMode)} · ${
                liveRaidRun ? `${humanizeStatus(activeRaidStatus ?? "queued")} · ${availabilityLabel}` : availabilityLabel
              }`}
            </span>
          </div>

          <div className="mercenary-mode-switch" role="tablist" aria-label="Demo transport mode">
            <button
              className={`mercenary-mode-chip ${demoMode === "raid" ? "mercenary-mode-chip--active" : ""}`}
              onClick={() => handleModeChange("raid")}
              type="button"
            >
              raid chat
            </button>
            <button
              className={`mercenary-mode-chip ${demoMode === "chat_v1" ? "mercenary-mode-chip--active" : ""}`}
              onClick={() => handleModeChange("chat_v1")}
              type="button"
            >
              v1 completions
            </button>
          </div>

          <div className="mercenary-chat__topbar-actions">
            <StatusPill tone={liveRaidRun ? (raidIsTerminal ? "ready" : "working") : canLaunchLiveRaid ? "ready" : "offline"}>
              {liveRaidRun ? humanizeStatus(activeRaidStatus ?? "queued") : availabilityLabel}
            </StatusPill>
            {hasConversation ? (
              <button className="button" disabled={isLaunching} onClick={resetConversation} type="button">
                new chat
              </button>
            ) : null}
          </div>
        </div>

        <div aria-live="polite" className="mercenary-chat__thread" ref={threadRef}>
          <ChatMessage avatarSrc={heroImage} label="Mercenary" role="assistant">
            <p>
              {demoMode === "raid"
                ? "Talk to Mercenary directly here. I’ll answer normally, and if you ask for real scoped work I’ll open a native raid and hire specialists in the background."
                : "Tell me what you want and I’ll route it through v1 chat completions so you can compare the compatibility layer against the native raid path."}
            </p>
            <p className="mercenary-message__note">
              Mercenary can be wrong, hallucinate, or merge weak specialist output. Verify important claims, code, and proofs before you rely on them.
            </p>
          </ChatMessage>

          {lastSubmittedBrief ? (
            <ChatMessage label="You" role="user">
              <p>{lastSubmittedBrief}</p>
            </ChatMessage>
          ) : null}

          {isLaunching ? (
            <ChatMessage avatarSrc={heroImage} label="Mercenary" role="assistant">
              <p>
                {demoMode === "raid"
                  ? "Reviewing the request and opening a native raid."
                  : "Reviewing the request and running it through /v1/chat/completions."}
              </p>
              <TypingDots />
            </ChatMessage>
          ) : null}

          {launchError ? (
            <ChatMessage avatarSrc={heroImage} label="Mercenary" role="assistant" tone="error">
              <p>I could not start the raid.</p>
              <p>{launchError}</p>
            </ChatMessage>
          ) : null}

          {liveRaidRun ? (
            <ChatMessage avatarSrc={heroImage} label="Mercenary" role="assistant">
              <p>{buildRaidStatusCopy(liveRaidRun)}</p>
              <div className="mercenary-pill-row">
                <StatusPill tone="available">{buildDemoModeLabel(liveRaidRun.requestMode)}</StatusPill>
                <StatusPill tone={raidIsTerminal ? "ready" : "working"}>{`status ${humanizeStatus(activeRaidStatus ?? "queued")}`}</StatusPill>
                <StatusPill tone="available">
                  {liveRaidRun.directResponse ? "no raid launched" : `${liveRaidRun.spawn.selectedExperts} specialists invited`}
                </StatusPill>
                <StatusPill tone="available">{`time ${elapsedLabel}`}</StatusPill>
                {liveRaidRun.spawn.estimatedFirstResultSec > 0 ? (
                  <StatusPill tone="available">{`eta ${liveRaidRun.spawn.estimatedFirstResultSec}s`}</StatusPill>
                ) : null}
              </div>
              <p className="mercenary-message__note">{`Updated ${formatTimestamp(liveRaidRun.lastUpdatedAt)}`}</p>
              {liveRaidRun.pollError ? <p className="mercenary-message__note">Last refresh error: {liveRaidRun.pollError}</p> : null}
            </ChatMessage>
          ) : null}

          {liveResultText || liveArtifacts.length > 0 || livePatch ? (
            <ChatMessage avatarSrc={heroImage} label="Mercenary" role="assistant" tone="success">
              {liveResultText ? <p className="mercenary-final__answer">{liveResultText}</p> : <p>Final delivery is ready.</p>}
              {liveExplanation && !liveResultText ? <p>{liveExplanation}</p> : null}
              {liveRaidRun?.requestMode === "chat_v1" && !liveRaidRun.directResponse ? (
                <p className="mercenary-message__note">Returned through `/v1/chat/completions` and linked back to the same raid receipt and trace.</p>
              ) : null}

              {liveArtifacts.length > 0 ? (
                <ArtifactGallery artifacts={liveArtifacts} onOpenArtifact={setExpandedArtifact} />
              ) : null}

              {livePatch ? <pre className="code-panel mercenary-final__code">{livePatch}</pre> : null}
            </ChatMessage>
          ) : null}

          {liveRaidRun && raidIsTerminal && !liveResultText && liveArtifacts.length === 0 && !livePatch ? (
            <ChatMessage avatarSrc={heroImage} label="Mercenary" role="assistant" tone="error">
              <p>
                {liveRaidRun.requestMode === "chat_v1"
                  ? "Mercenary did not get an approved specialist answer for this v1 completion."
                  : "Mercenary did not get an approved specialist deliverable for this raid."}
              </p>
              <p className="mercenary-message__note">
                {isLowSignalChatPrompt(lastSubmittedBrief ?? "")
                  ? "Short greetings usually stay conversational. Ask a concrete question or scoped task if you want specialist output."
                  : "Try rephrasing the request more concretely, or switch to raid chat if you want a scoped build workflow."}
              </p>
            </ChatMessage>
          ) : null}
        </div>

        <div className="mercenary-composer">
          {!hasConversation ? (
            <div className="mercenary-composer__suggestions">
              {promptSuggestions.map((prompt) => (
                <button
                  className={`mercenary-suggestion ${liveDemoBrief === prompt ? "mercenary-suggestion--active" : ""}`}
                  key={prompt}
                  onClick={() => setLiveDemoBrief(prompt)}
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>
          ) : null}

          <label className="mercenary-composer__field">
            <textarea
              className="mercenary-composer__textarea"
              onChange={(event) => setLiveDemoBrief(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Message Mercenary..."
              spellCheck={false}
              value={liveDemoBrief}
            />
          </label>

          <div className="mercenary-composer__footer">
            <p>Enter sends. Shift+Enter adds a line break.</p>
            <div className="mercenary-action-row">
              <button className="button button--primary" disabled={!canSendBrief} onClick={() => void launchConversation()} type="button">
                {isLaunching ? "sending..." : "send"}
              </button>
            </div>
          </div>
        </div>
      </article>

      <aside className="mercenary-sidebar">
        <section className="mercenary-sidebar__panel">
          <div className="mercenary-sidebar__head">
            <div>
              <span className="mercenary-sidebar__eyebrow">Run</span>
              <strong>{liveRaidRun?.directResponse ? "Direct reply" : liveRaidRun ? "Live state" : "Standby"}</strong>
            </div>
            <StatusPill tone={liveRaidRun ? (raidIsTerminal ? "ready" : "working") : canLaunchLiveRaid ? "ready" : "offline"}>
              {liveRaidRun ? humanizeStatus(activeRaidStatus ?? "queued") : "idle"}
            </StatusPill>
          </div>

          <div className="mercenary-sidebar__signal-strip">
            {runSignals.map((signal) => (
              <SidebarRow key={`run:${signal.label}`} label={signal.label} value={signal.value} />
            ))}
          </div>

          {liveRaidRun?.lastUpdatedAt ? <p className="mercenary-sidebar__note">{`Updated ${formatTimestamp(liveRaidRun.lastUpdatedAt)}`}</p> : null}

          {showReceiptLinks || showTraceLink ? (
            <div className="mercenary-sidebar__actionstrip">
              {showReceiptLinks ? (
                <a className="mercenary-sidebar__actionchip" href={liveRaidRun?.spawn.receiptPath}>
                  receipt
                </a>
              ) : null}
              {showTraceLink ? (
                <a className="mercenary-sidebar__actionchip" href={buildAgentLogPath(liveRaidRun!)} rel="noreferrer" target="_blank">
                  trace
                </a>
              ) : null}
              {showReceiptLinks ? (
                <button className="mercenary-sidebar__actionchip mercenary-sidebar__actionchip--button" onClick={() => void copyReceiptLink()} type="button">
                  {receiptCopied ? "copied" : "copy link"}
                </button>
              ) : null}
            </div>
          ) : liveRaidRun?.directResponse ? (
            <p className="mercenary-sidebar__note">Direct v1 reply. Mercenary did not open a raid for this turn.</p>
          ) : (
            <p className="mercenary-sidebar__note">Proof and trace stay hidden until Mercenary opens a real run.</p>
          )}
        </section>

        <section className="mercenary-sidebar__panel">
          <div className="mercenary-sidebar__head">
            <div>
              <span className="mercenary-sidebar__eyebrow">Attestation</span>
              <strong>{runtimeAttestationLabel}</strong>
            </div>
            <StatusPill tone={runtimeAttestation ? "ready" : runtimeAttestationError ? "offline" : "working"}>
              {runtimeAttestationStatus}
            </StatusPill>
          </div>

          <div className="mercenary-sidebar__signal-strip">
            {attestationSignals.map((signal) => (
              <SidebarRow key={`attest:${signal.label}`} label={signal.label} value={signal.value} />
            ))}
          </div>

          <details className="mercenary-sidebar__disclosure">
            <summary className="mercenary-sidebar__disclosure-summary">
              <span>proof detail</span>
              <strong>{runtimeAttestation ? "open" : runtimeAttestationSignerDisabled ? "signer off" : "inspect"}</strong>
            </summary>

            <div className="mercenary-sidebar__actionstrip">
              <a className="mercenary-sidebar__actionchip" href={buildAttestedRuntimePath()} rel="noreferrer" target="_blank">
                runtime proof
              </a>
              {showResultProofLink ? (
                <a className="mercenary-sidebar__actionchip" href={buildAttestedResultPath(liveRaidRun!)} rel="noreferrer" target="_blank">
                  result proof
                </a>
              ) : null}
            </div>

            <p className="mercenary-sidebar__note">
              {runtimeAttestation
                ? `Runtime is attested on ${runtimeAttestationTarget} / ${runtimeAttestationTee}. Specialist TEE and signed badges come from routed provider privacy proofs and registry data.`
                : runtimeAttestationSignerDisabled
                  ? "This host is not publishing signed runtime or result envelopes because the attestation signer is not configured."
                  : runtimeAttestationError ?? "Loading runtime attestation."}
            </p>
          </details>
        </section>

        <section className="mercenary-sidebar__panel">
          <div className="mercenary-sidebar__head">
            <div>
              <span className="mercenary-sidebar__eyebrow">Specialists</span>
              <strong>{liveRaidRun?.directResponse ? "Not opened" : liveRaidRun ? "Live roster" : "Roster"}</strong>
            </div>
          </div>

          {liveRaidRun?.directResponse ? (
            <p className="mercenary-sidebar__note">Mercenary answered directly, so specialists stayed idle for this turn.</p>
          ) : liveRaidRun ? (
            <div className="mercenary-sidebar__specialists">
              {highlightedSidebarSpecialists.map((specialist) => (
                <div className="mercenary-sidebar__specialist mercenary-sidebar__specialist--compact" key={specialist.providerId}>
                  <div className="mercenary-sidebar__specialist-copy">
                    <div className="mercenary-sidebar__specialist-label">
                      <span className={`mercenary-sidebar__dot mercenary-sidebar__dot--${specialist.statusTone}`} />
                      <strong>{specialist.displayName}</strong>
                    </div>
                    <small className="mercenary-sidebar__specialist-status">{specialist.statusLabel}</small>
                  </div>
                  <div className="mercenary-sidebar__specialist-side">
                    {specialist.progressValue != null ? <SpecialistProgressMeter progressValue={specialist.progressValue} tone={specialist.statusTone} /> : null}
                  </div>
                </div>
              ))}

              {highlightedSidebarSpecialists.length === 0 ? <p className="mercenary-sidebar__note">Waiting for specialist state.</p> : null}
            </div>
          ) : (
            <div className="mercenary-sidebar__signal-strip">
              <SidebarRow label="roster" value={`${specialistRosterCount} listed`} />
              <SidebarRow label="ready" value={compactAvailabilityLabel} />
            </div>
          )}

          <div className="mercenary-sidebar__actionstrip">
            <a className="mercenary-sidebar__actionchip" href="/raiders">
              open raiders
            </a>
          </div>
        </section>

        {showTracePanel ? (
          <section className="mercenary-sidebar__panel">
            <details className="mercenary-sidebar__disclosure" open={!raidIsTerminal}>
              <summary className="mercenary-sidebar__disclosure-summary">
                <div className="mercenary-sidebar__specialist-copy">
                  <span className="mercenary-sidebar__eyebrow">Trace</span>
                  <strong>{raidIsTerminal ? "Closed process trace" : "Live process trace"}</strong>
                </div>
                <StatusPill tone={raidIsTerminal ? "ready" : "working"}>{`${traceEventCount} events`}</StatusPill>
              </summary>

              <div className="mercenary-trace-list">
                {mercenaryDecisionTrace.length > 0 ? (
                  <details className="mercenary-trace" open={!raidIsTerminal}>
                    <summary className="mercenary-trace__summary">
                      <div>
                        <strong>Mercenary</strong>
                        <span>{`${mercenaryDecisionTrace.length} planning decisions`}</span>
                      </div>
                      <StatusPill tone={raidIsTerminal ? "ready" : "working"}>{raidIsTerminal ? "finalized" : "planning"}</StatusPill>
                    </summary>
                    <div className="mercenary-trace__events">
                      {mercenaryDecisionTrace.map((decision, index) => (
                        <div className="mercenary-trace__event" key={`${decision.type}:${decision.at}:${index}`}>
                          <div className="mercenary-trace__event-meta">
                            <strong>{humanizeStatus(decision.type)}</strong>
                            <span>{formatTimestamp(decision.at)}</span>
                          </div>
                          <p>{decision.summary}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}

                {specialistTraces.map((trace) => (
                  <details className="mercenary-trace" key={trace.providerId}>
                    <summary className="mercenary-trace__summary">
                      <div>
                        <strong>{trace.displayName}</strong>
                        <span>{trace.scope || "specialist trace"}</span>
                      </div>
                      <StatusPill tone={trace.statusTone}>{trace.statusLabel}</StatusPill>
                    </summary>
                    <div className="mercenary-trace__events">
                      {trace.outcome ? <p className="mercenary-trace__outcome">{trace.outcome}</p> : null}
                      {trace.events.map((event) => (
                        <div className="mercenary-trace__event" key={event.id}>
                          <div className="mercenary-trace__event-meta">
                            <strong>{event.label}</strong>
                            <span>{formatTimestamp(event.at)}</span>
                          </div>
                          <p>{event.note}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          </section>
        ) : null}
      </aside>

      {expandedArtifact ? (
        <ArtifactLightbox artifact={expandedArtifact} onClose={() => setExpandedArtifact(null)} />
      ) : null}
    </section>
  );
}

function ChatMessage({
  avatarSrc,
  children,
  label,
  role,
  tone = "default",
}: {
  avatarSrc?: string;
  children: ReactNode;
  label: string;
  role: "assistant" | "user";
  tone?: "default" | "error" | "success";
}) {
  return (
    <article
      className={`mercenary-message mercenary-message--${role} ${
        tone === "error" ? "mercenary-message--error" : tone === "success" ? "mercenary-message--success" : ""
      }`}
    >
      {role === "assistant" && avatarSrc ? <img alt={label} className="mercenary-message__avatar" src={avatarSrc} /> : null}
      <div className="mercenary-message__body">
        <div className="mercenary-message__bubble">{children}</div>
      </div>
    </article>
  );
}

function SidebarRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="mercenary-sidebar__signal">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({
  children,
  tone,
}: {
  children: string;
  tone: SpecialistTone;
}) {
  return <span className={`mercenary-status mercenary-status--${tone}`}>{children}</span>;
}

function SpecialistProgressMeter({
  progressValue,
  tone,
}: {
  progressValue: number;
  tone: SpecialistTone;
}) {
  const filledBars = Math.max(1, Math.min(10, Math.round(progressValue * 10)));

  return (
    <div
      aria-hidden="true"
      className={`mercenary-sidebar__meter mercenary-sidebar__meter--${tone}`}
      title={`${Math.round(progressValue * 100)}%`}
    >
      {Array.from({ length: 10 }).map((_, index) => (
        <span
          className={`mercenary-sidebar__meter-bar ${index < filledBars ? "mercenary-sidebar__meter-bar--filled" : ""}`}
          key={index}
        />
      ))}
    </div>
  );
}

function TypingDots() {
  return (
    <div className="mercenary-typing" aria-label="Mercenary is typing">
      <span />
      <span />
      <span />
    </div>
  );
}

function ArtifactGallery({
  artifacts,
  onOpenArtifact,
}: {
  artifacts: SubmissionArtifact[];
  onOpenArtifact: (artifact: SubmissionArtifact) => void;
}) {
  return (
    <div className="mercenary-artifact-grid">
      {artifacts.map((artifact) => (
        <ArtifactCard artifact={artifact} key={`${artifact.outputType}:${artifact.label}:${artifact.uri}`} onOpenArtifact={onOpenArtifact} />
      ))}
    </div>
  );
}

function ArtifactCard({
  artifact,
  onOpenArtifact,
}: {
  artifact: SubmissionArtifact;
  onOpenArtifact: (artifact: SubmissionArtifact) => void;
}) {
  const isImage = isRenderableImageArtifact(artifact);
  const isVideo = isRenderableVideoArtifact(artifact);
  const bundle = parseBundleArtifact(artifact);
  const bundlePreviewFiles = bundle?.files.slice(0, 5) ?? [];
  const bundleImageFiles = bundle?.files.filter((file) => file.mimeType.startsWith("image/")).slice(0, 3) ?? [];

  return (
    <article className={`mercenary-artifact mercenary-artifact--${artifact.outputType}`}>
      {isImage ? (
        <button className="mercenary-artifact__preview" onClick={() => onOpenArtifact(artifact)} type="button">
          <img alt={artifact.label} loading="lazy" src={artifact.uri} />
        </button>
      ) : null}

      {isVideo ? (
        <div className="mercenary-artifact__preview mercenary-artifact__preview--video">
          <video controls preload="metadata" src={artifact.uri} />
        </div>
      ) : null}

      {bundle ? (
        <div className="mercenary-artifact__bundle">
          {bundleImageFiles.length > 0 ? (
            <div className="mercenary-artifact__bundle-strip">
              {bundleImageFiles.map((file) => (
                <img alt={file.relativePath} key={file.relativePath} loading="lazy" src={file.uri} />
              ))}
            </div>
          ) : null}
          <p>{`${bundle.files.length} generated files`}</p>
          <div className="mercenary-artifact__bundle-files">
            {bundlePreviewFiles.map((file) => (
              <a
                className="mercenary-artifact__bundle-file"
                download={buildBundleFileDownloadName(file.relativePath)}
                href={file.uri}
                key={file.relativePath}
              >
                {file.relativePath}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mercenary-artifact__meta">
        <span>{artifactKindLabel(artifact)}</span>
        <strong>{artifact.label}</strong>
        {artifact.description ? <p>{artifact.description}</p> : null}
      </div>

      <div className="mercenary-artifact__actions">
        {(isImage || isVideo) && !artifact.uri.startsWith("data:application/json") ? (
          <button className="mercenary-artifact__action" onClick={() => onOpenArtifact(artifact)} type="button">
            open
          </button>
        ) : null}
        <a className="mercenary-artifact__action" download={buildArtifactDownloadName(artifact)} href={artifact.uri}>
          download
        </a>
      </div>
    </article>
  );
}

function ArtifactLightbox({
  artifact,
  onClose,
}: {
  artifact: SubmissionArtifact;
  onClose: () => void;
}) {
  const isImage = isRenderableImageArtifact(artifact);
  const isVideo = isRenderableVideoArtifact(artifact);

  if (!isImage && !isVideo) {
    return null;
  }

  return (
    <div className="mercenary-lightbox" onClick={onClose} role="presentation">
      <div className="mercenary-lightbox__dialog" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="mercenary-lightbox__head">
          <div>
            <span>{artifactKindLabel(artifact)}</span>
            <strong>{artifact.label}</strong>
          </div>
          <button className="mercenary-lightbox__close" onClick={onClose} type="button">
            close
          </button>
        </div>

        <div className="mercenary-lightbox__body">
          {isImage ? <img alt={artifact.label} src={artifact.uri} /> : null}
          {isVideo ? <video controls preload="metadata" src={artifact.uri} /> : null}
        </div>
      </div>
    </div>
  );
}

function buildConversationSpecialistRecords(
  activeExperts: RaidStatusSnapshot["experts"],
  result: RaidResult | undefined,
  providerById: Map<string, Provider>,
  healthByProviderId: Map<string, ProviderHealth>,
): ConversationSpecialistRecord[] {
  if (activeExperts.length > 0) {
    return activeExperts.map((expert) => {
      const provider = providerById.get(expert.providerId);
      const health = healthByProviderId.get(expert.providerId);
      const routingDecision = result?.routingProof?.providers.find((entry) => entry.providerId === expert.providerId);
      const meta = [provider?.modelFamily ?? health?.model ?? "", formatProgress(expert.progress), formatLatency(expert.latencyMs)]
        .filter((value): value is string => Boolean(value))
        .join(" • ");

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
  const primaryProviders = routingProviders.some((entry) => entry.phase === "primary")
    ? routingProviders.filter((entry) => entry.phase === "primary")
    : routingProviders;

  return primaryProviders.map((entry) => {
    const provider = providerById.get(entry.providerId);
    const health = healthByProviderId.get(entry.providerId);
    const resolvedStatus = approvedProviderIds.has(entry.providerId)
      ? "approved"
      : droppedProviderIds.has(entry.providerId)
        ? "dropped"
        : entry.phase === "reserve"
          ? "reserve"
          : "invited";
    const meta = [provider?.modelFamily ?? entry.modelFamily ?? health?.model ?? "", entry.matchedSpecializations.slice(0, 2).join(" / ")]
      .filter((value): value is string => Boolean(value))
      .join(" • ");

    return {
      providerId: entry.providerId,
      displayName: provider?.displayName ?? health?.providerName ?? entry.providerId,
      statusLabel: humanizeStatus(resolvedStatus),
      statusTone: mapStatusTone(resolvedStatus),
      note: entry.roleLabel ?? entry.workstreamLabel ?? entry.reasons[0] ?? buildProviderNote(provider, health),
      meta,
      progressValue: resolveSpecialistProgress(resolvedStatus),
      proofTags: buildProviderProofTags(provider, entry),
    };
  });
}

function buildSpecialistTraceRecords(
  agentLog: RaidAgentLog | undefined,
  result: RaidResult | undefined,
  activeExperts: RaidStatusSnapshot["experts"],
  providerById: Map<string, Provider>,
  healthByProviderId: Map<string, ProviderHealth>,
): SpecialistTraceRecord[] {
  const providerIds = uniqueStrings([
    ...activeExperts.map((expert) => expert.providerId),
    ...(result?.synthesizedOutput?.contributingProviderIds ?? []),
    ...(result?.synthesizedOutput?.droppedProviderIds ?? []),
    ...(agentLog?.workstreams.flatMap((workstream) => [...workstream.providers, ...workstream.approvedProviders]) ?? []),
    ...(agentLog?.toolCalls.map((call) => call.target ?? "").filter((value) => value.length > 0) ?? []),
    ...(agentLog?.failures.map((failure) => failure.providerId ?? "").filter((value) => value.length > 0) ?? []),
  ]);

  return providerIds
    .map((providerId) => {
      const provider = providerById.get(providerId);
      const health = healthByProviderId.get(providerId);
      const expert = activeExperts.find((entry) => entry.providerId === providerId);
      const routingDecision = result?.routingProof?.providers.find((entry) => entry.providerId === providerId);
      const contribution = result?.synthesizedOutput?.contributions.find((entry) => entry.providerId === providerId);
      const approvedSubmission = result?.approvedSubmissions?.find((entry) => entry.submission.providerId === providerId);
      const workstream = agentLog?.workstreams.find(
        (entry) => entry.providers.includes(providerId) || entry.approvedProviders.includes(providerId),
      );
      const dropped = result?.synthesizedOutput?.droppedProviderIds.includes(providerId) ?? false;
      const approved = result?.synthesizedOutput?.contributingProviderIds.includes(providerId) ?? false;
      const resolvedStatus = expert?.status ?? (approved ? "approved" : dropped ? "dropped" : workstream?.status ?? "invited");
      const outcome = approvedSubmission?.breakdown.summary ?? expert?.message ?? "";
      const scope =
        [workstream?.workstreamLabel, workstream?.roleLabel, routingDecision?.roleLabel ?? contribution?.roleLabel]
          .filter((value): value is string => Boolean(value))
          .join(" / ") ||
        buildProviderNote(provider, health);

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

function buildHostedSpecialistRecords(
  providers: Provider[],
  providerHealth: ProviderHealth[],
  healthByProviderId: Map<string, ProviderHealth>,
): ConversationSpecialistRecord[] {
  if (providers.length === 0) {
    return providerHealth.map((entry) => ({
      providerId: entry.providerId,
      displayName: entry.providerName ?? entry.providerId,
      statusLabel: entry.ready ? "ready" : entry.reachable ? "reachable" : "offline",
      statusTone: entry.ready ? "ready" : entry.reachable ? "available" : "offline",
      note: entry.error ?? entry.endpoint ?? "Waiting for provider metadata.",
      meta: entry.model ?? "",
      progressValue: null,
      proofTags: [],
    }));
  }

  return providers.map((provider) => {
    const health = healthByProviderId.get(provider.providerId);
    const statusLabel = health?.ready ? "ready" : health?.reachable ? "reachable" : humanizeStatus(provider.status || "available");
    const statusTone = health?.ready ? "ready" : health?.reachable ? "available" : provider.status === "offline" ? "offline" : "available";

    return {
      providerId: provider.providerId,
      displayName: provider.displayName,
      statusLabel,
      statusTone,
      note: buildProviderNote(provider, health),
      meta: provider.modelFamily ?? health?.model ?? "",
      progressValue: null,
      proofTags: buildProviderProofTags(provider),
    };
  });
}

function buildProviderNote(provider: Provider | undefined, health: ProviderHealth | undefined): string {
  if (provider?.specializations.length) {
    return provider.specializations.slice(0, 3).join(" / ");
  }

  return provider?.description ?? health?.error ?? health?.endpoint ?? "Specialization pending.";
}

function buildRaidStatusCopy(run: LiveRaidRun): string {
  if (run.directResponse) {
    return "Mercenary answered directly on the v1 route without opening specialists.";
  }

  const status = run.status?.status ?? run.spawn.status;
  const routeLabel = run.requestMode === "chat_v1" ? "v1 chat completion" : "native raid";

  if (status === "queued") {
    return `I accepted the request and I’m matching the ${routeLabel} to live specialists.`;
  }

  if (status === "running") {
    return run.requestMode === "chat_v1"
      ? "The v1 completion is live. Mercenary is still opening scoped specialist workstreams behind the compatibility layer."
      : "The raid is live. I’m collecting scoped specialist output and filtering weak branches.";
  }

  if (status === "final" && run.result?.synthesizedOutput) {
    return run.requestMode === "chat_v1"
      ? "The v1 completion is final. Mercenary merged the strongest specialist outputs into one clean assistant answer."
      : "The raid is final. I merged the strongest specialist outputs into one delivery.";
  }

  if (status === "final") {
    return run.requestMode === "chat_v1"
      ? "The v1 completion reached a terminal state, but Mercenary did not get an approved specialist answer for this prompt."
      : "The raid reached a terminal state, but I did not get an approved specialist deliverable for this prompt.";
  }

  return `The ${routeLabel} is ${humanizeStatus(status)}.`;
}

function buildAgentLogPath(run: LiveRaidRun): string {
  return `${API_BASE}/v1/raids/${encodeURIComponent(run.spawn.raidId)}/agent_log.json?token=${encodeURIComponent(run.spawn.raidAccessToken)}`;
}

function buildAttestedRuntimePath(): string {
  return `${API_BASE}/v1/attested-runtime`;
}

function buildAttestedResultPath(run: LiveRaidRun): string {
  return `${API_BASE}/v1/raid/${encodeURIComponent(run.spawn.raidId)}/attested-result?token=${encodeURIComponent(run.spawn.raidAccessToken)}`;
}

function humanizeToolCall(tool: string): string {
  switch (tool) {
    case "provider_http_invite":
      return "Invited";
    case "provider_http_accept":
      return "Accepted";
    case "provider_http_run":
      return "Running";
    case "evaluate_submission":
      return "Evaluated";
    default:
      return humanizeStatus(tool);
  }
}

function buildToolCallTrace(call: RaidAgentLog["toolCalls"][number]): string {
  if (call.tool === "provider_http_invite") {
    const workstream = typeof call.details?.workstream === "string" ? call.details.workstream : null;
    const role = typeof call.details?.role === "string" ? call.details.role : null;
    return [workstream, role].filter((value): value is string => Boolean(value)).join(" / ") || "Mercenary opened the assignment.";
  }

  if (call.tool === "provider_http_accept") {
    return typeof call.details?.providerRunId === "string"
      ? `Run id ${call.details.providerRunId}.`
      : "Specialist accepted the assignment.";
  }

  if (call.tool === "provider_http_run") {
    const latency =
      typeof call.details?.latencyMs === "number" && Number.isFinite(call.details.latencyMs)
        ? `${Math.round(call.details.latencyMs)}ms`
        : null;
    return latency ? `Specialist started execution. ${latency}.` : "Specialist started execution.";
  }

  if (call.tool === "evaluate_submission") {
    return "Mercenary scored the submitted deliverable.";
  }

  return call.status;
}

function buildAbsolutePath(path: string): string {
  if (typeof window === "undefined") {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}

function isTerminalRaidStatus(status: string): boolean {
  return TERMINAL_RAID_STATUSES.has(status);
}

function selectResultText(result: RaidResult | undefined): string | undefined {
  return result?.synthesizedOutput?.answerText ?? result?.primarySubmission?.submission.answerText;
}

function selectChatCompletionText(chatCompletion: ChatCompletionResponse | undefined): string | undefined {
  return chatCompletion?.choices[0]?.message?.content;
}

function selectResultExplanation(result: RaidResult | undefined): string | undefined {
  return result?.synthesizedOutput?.explanation ?? result?.primarySubmission?.submission.explanation;
}

function selectResultPatch(result: RaidResult | undefined): string | undefined {
  return result?.synthesizedOutput?.patchUnifiedDiff ?? result?.primarySubmission?.submission.patchUnifiedDiff;
}

function selectArtifacts(result: RaidResult | undefined): SubmissionArtifact[] {
  return (result?.synthesizedOutput?.artifacts ?? result?.primarySubmission?.submission.artifacts ?? []) as SubmissionArtifact[];
}

function artifactKindLabel(artifact: SubmissionArtifact): string {
  return artifact.mimeType ? `${artifact.outputType} · ${artifact.mimeType}` : artifact.outputType;
}

function isRenderableImageArtifact(artifact: SubmissionArtifact): boolean {
  if (artifact.mimeType?.startsWith("image/")) {
    return true;
  }

  return artifact.mimeType == null && artifact.outputType === "image";
}

function isRenderableVideoArtifact(artifact: SubmissionArtifact): boolean {
  if (artifact.mimeType?.startsWith("video/")) {
    return true;
  }

  return artifact.mimeType == null && artifact.outputType === "video";
}

function parseBundleArtifact(artifact: SubmissionArtifact): BundleArtifactPreview | null {
  if (artifact.outputType !== "bundle") {
    return null;
  }

  const payload = decodeArtifactPayload(artifact.uri);
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as {
      artifactId?: string;
      files?: Array<{
        relativePath?: string;
        mimeType?: string;
        bytes?: number;
        sha256?: string;
        data?: string;
      }>;
    };
    const files = Array.isArray(parsed.files)
      ? parsed.files
          .filter(
            (file): file is {
              relativePath: string;
              mimeType: string;
              bytes: number;
              sha256: string;
              data: string;
            } =>
              typeof file?.relativePath === "string" &&
              typeof file?.mimeType === "string" &&
              typeof file?.bytes === "number" &&
              typeof file?.sha256 === "string" &&
              typeof file?.data === "string",
          )
          .map((file) => ({
            relativePath: file.relativePath,
            mimeType: file.mimeType,
            bytes: file.bytes,
            sha256: file.sha256,
            uri: `data:${file.mimeType};base64,${file.data}`,
          }))
      : [];

    return {
      artifactId: typeof parsed.artifactId === "string" ? parsed.artifactId : artifact.label,
      files,
    };
  } catch {
    return null;
  }
}

function decodeArtifactPayload(uri: string): string | null {
  const match = uri.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/s);
  if (!match) {
    return null;
  }

  const [, , isBase64, body] = match;
  try {
    return isBase64 ? atob(body) : decodeURIComponent(body);
  } catch {
    return null;
  }
}

function buildArtifactDownloadName(artifact: SubmissionArtifact): string {
  const extension = extensionForMimeType(artifact.mimeType, artifact.outputType);
  return `${slugifyLabel(artifact.label, artifact.outputType)}.${extension}`;
}

function buildBundleFileDownloadName(path: string): string {
  const clean = path.trim().replace(/^\/+/, "");
  return clean.length > 0 ? clean.split("/").pop() ?? clean : "artifact";
}

function extensionForMimeType(mimeType: string | undefined, fallback: string): string {
  switch (mimeType) {
    case "image/gif":
      return "gif";
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "application/json":
      return "json";
    case "application/x-subrip":
      return "srt";
    case "text/markdown; charset=utf-8":
      return "md";
    default:
      return fallback === "bundle" ? "json" : "txt";
  }
}

function slugifyLabel(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function selectApprovedProviderIds(result: RaidResult | undefined): string[] {
  if (!result) {
    return [];
  }

  if (result.settlementExecution?.successfulProviderIds.length) {
    return uniqueStrings(result.settlementExecution.successfulProviderIds);
  }

  if (result.synthesizedOutput?.contributingProviderIds.length) {
    return uniqueStrings(result.synthesizedOutput.contributingProviderIds);
  }

  return uniqueStrings((result.approvedSubmissions ?? []).map((entry) => entry.submission.providerId));
}

function buildDemoChatCompletionPayload(brief: string) {
  const lowSignalChat = isLowSignalChatPrompt(brief);

  return {
    model: V1_CHAT_MODEL,
    messages: [
      {
        role: "system",
        content: "You are Mercenary. Be concise and return one clean final answer.",
      },
      {
        role: "user",
        content: brief,
      },
    ],
    raid_policy: {
      max_agents: lowSignalChat ? 1 : 3,
      max_latency_sec: lowSignalChat ? 20 : 60,
    },
  };
}

function buildSpawnFromChatCompletion(chatCompletion: ChatCompletionResponse | null): RaidSpawnOutput | null {
  if (!chatCompletion?.raid) {
    return null;
  }

  return {
    raidId: chatCompletion.raid.raid_id,
    raidAccessToken: chatCompletion.raid.raid_access_token,
    receiptPath: chatCompletion.raid.receipt_path,
    status: chatCompletion.raid.status ?? "queued",
    selectedExperts: chatCompletion.raid.agents_invited,
    reserveExperts: 0,
    estimatedFirstResultSec: 0,
    sanitization: {
      riskTier: "safe",
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      trimmedFiles: 0,
    },
  };
}

function buildDirectChatSpawn(chatCompletion: ChatCompletionResponse | undefined): RaidSpawnOutput {
  return {
    raidId: chatCompletion?.id ?? "chatcmpl_direct",
    raidAccessToken: "",
    receiptPath: "",
    status: "final",
    selectedExperts: 0,
    reserveExperts: 0,
    estimatedFirstResultSec: 0,
    sanitization: {
      riskTier: "safe",
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      trimmedFiles: 0,
    },
  };
}

function buildDemoModeLabel(mode: DemoRequestMode): string {
  return mode === "chat_v1" ? "v1 completions" : "raid chat";
}

function buildRuntimeAttestationLabel(target: string, teePlatform: string): string {
  const haystack = `${target} ${teePlatform}`.toLowerCase();
  if (haystack.includes("phala")) {
    return "Phala TEE attested";
  }
  if (haystack.includes("eigen")) {
    return "EigenCompute TEE attested";
  }
  if (teePlatform !== "pending" && teePlatform.trim().length > 0) {
    return `${teePlatform} TEE attested`;
  }
  return "TEE attestation";
}

function isAttestationSignerUnavailable(error: string | null | undefined): boolean {
  return typeof error === "string" && error.includes("MNEMONIC environment variable is required");
}

function isLowSignalChatPrompt(brief: string): boolean {
  const normalizedBrief = brief.trim().toLowerCase();
  if (normalizedBrief.length === 0) {
    return false;
  }

  return (
    /^(hi|hello|hey|yo|sup|hiya|howdy)\b/.test(normalizedBrief) ||
    /^what'?s up\b/.test(normalizedBrief) ||
    /^who are you\b/.test(normalizedBrief) ||
    /^what can you do\b/.test(normalizedBrief)
  );
}

function formatElapsedMs(startedAtMs: number, completedAtMs?: number): string {
  const endMs = completedAtMs ?? Date.now();
  const durationMs = Math.max(endMs - startedAtMs, 0);
  if (durationMs < 1_000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1_000).toFixed(durationMs >= 10_000 ? 0 : 1)}s`;
}

function buildProviderProofTags(
  provider: Provider | undefined,
  routingDecision?: NonNullable<RaidResult["routingProof"]>["providers"][number],
): string[] {
  const tags: string[] = [];
  const privacyFeatures = new Set<string>(routingDecision?.privacyFeatures ?? []);
  if (provider?.privacy?.teeAttested) {
    privacyFeatures.add("tee_attested");
  }
  if (provider?.privacy?.signedOutputs) {
    privacyFeatures.add("signed_outputs");
  }
  if ((routingDecision?.erc8004VerificationStatus ?? provider?.erc8004?.verification?.status) === "verified") {
    tags.push("8004");
  }
  if (privacyFeatures.has("tee_attested")) {
    tags.push("TEE");
  }
  if (privacyFeatures.has("signed_outputs")) {
    tags.push("signed");
  }
  if (privacyFeatures.has("e2ee")) {
    tags.push("E2EE");
  }
  return uniqueStrings(tags).slice(0, 3);
}

function countTeeAttestedSpecialists(specialists: ConversationSpecialistRecord[]): number {
  return specialists.filter((specialist) => specialist.proofTags.includes("TEE")).length;
}

function countProofTag(specialists: ConversationSpecialistRecord[], tag: string): number {
  return specialists.filter((specialist) => specialist.proofTags.includes(tag)).length;
}

function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return "waiting";
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return value;
  }

  return timestamp.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function humanizeStatus(status: string): string {
  return status.replace(/[_-]+/g, " ").trim();
}

function formatProgress(progress: number | undefined): string | null {
  if (typeof progress !== "number" || Number.isNaN(progress)) {
    return null;
  }

  const percentage = progress <= 1 ? progress * 100 : progress;
  const clamped = Math.max(0, Math.min(100, percentage));
  return `${Math.round(clamped)}%`;
}

function formatLatency(latencyMs: number | undefined): string | null {
  if (typeof latencyMs !== "number" || Number.isNaN(latencyMs)) {
    return null;
  }

  return `${Math.round(latencyMs)}ms`;
}

function resolveSpecialistProgress(status: string, progress?: number): number | null {
  if (typeof progress === "number" && Number.isFinite(progress)) {
    const normalized = progress <= 1 ? progress : progress / 100;
    return Math.max(0, Math.min(1, normalized));
  }

  const normalizedStatus = status.toLowerCase();
  if (
    normalizedStatus.includes("approved") ||
    normalizedStatus.includes("submitted") ||
    normalizedStatus.includes("complete") ||
    normalizedStatus.includes("final") ||
    normalizedStatus.includes("paid")
  ) {
    return 1;
  }
  if (normalizedStatus.includes("running")) {
    return 0.72;
  }
  if (normalizedStatus.includes("accepted")) {
    return 0.46;
  }
  if (
    normalizedStatus.includes("invited") ||
    normalizedStatus.includes("selected") ||
    normalizedStatus.includes("queued") ||
    normalizedStatus.includes("pending") ||
    normalizedStatus.includes("reserve")
  ) {
    return 0.18;
  }
  if (
    normalizedStatus.includes("failed") ||
    normalizedStatus.includes("dropped") ||
    normalizedStatus.includes("invalid") ||
    normalizedStatus.includes("timed") ||
    normalizedStatus.includes("disqualified")
  ) {
    return 0.08;
  }

  return null;
}

function mapStatusTone(status: string): SpecialistTone {
  const normalizedStatus = status.toLowerCase();

  if (
    normalizedStatus.includes("approved") ||
    normalizedStatus.includes("complete") ||
    normalizedStatus.includes("submitted") ||
    normalizedStatus.includes("final")
  ) {
    return "ready";
  }

  if (
    normalizedStatus.includes("failed") ||
    normalizedStatus.includes("error") ||
    normalizedStatus.includes("cancelled") ||
    normalizedStatus.includes("expired") ||
    normalizedStatus.includes("rejected") ||
    normalizedStatus.includes("dropped") ||
    normalizedStatus.includes("offline")
  ) {
    return "offline";
  }

  if (
    normalizedStatus.includes("queued") ||
    normalizedStatus.includes("pending") ||
    normalizedStatus.includes("reserve") ||
    normalizedStatus.includes("invited") ||
    normalizedStatus.includes("waiting")
  ) {
    return "available";
  }

  return "working";
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}
