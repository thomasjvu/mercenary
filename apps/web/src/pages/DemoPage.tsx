import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import {
  API_BASE,
  fetchRaidResult,
  fetchRaidStatus,
  spawnDemoRaid,
  type Provider,
  type ProviderHealth,
  type RaidResult,
  type RaidSpawnOutput,
  type RaidStatus as RaidStatusSnapshot,
} from "../api";
import { buildLiveDemoPayload } from "../default-payload";
import heroImage from "../../../../assets/hero.webp";

type SpecialistTone = "ready" | "available" | "offline" | "working";

type DemoPageProps = {
  providers: Provider[];
  providerHealth: ProviderHealth[];
};

type LiveRaidRun = {
  spawn: RaidSpawnOutput;
  status?: RaidStatusSnapshot;
  result?: RaidResult;
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
};

const LIVE_POLL_INTERVAL_MS = 3_000;
const TERMINAL_RAID_STATUSES = new Set(["final", "cancelled", "expired"]);
const DEMO_PROMPTS = [
  "Build a one-room GB Studio microgame with one boss, one key, one exit, and a matching 12-second trailer.",
  "Create a fast retro launch package with a gameplay patch, pixel-art title card, sprite pack, and teaser copy.",
  "Ship a tiny arcade challenge with one enemy loop, one reward prop, and a trailer that matches the palette and hook.",
] as const;

export function DemoPage({ providers, providerHealth }: DemoPageProps) {
  const [liveDemoBrief, setLiveDemoBrief] = useState("");
  const [lastSubmittedBrief, setLastSubmittedBrief] = useState<string | null>(null);
  const [liveRaidRun, setLiveRaidRun] = useState<LiveRaidRun | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [receiptCopied, setReceiptCopied] = useState(false);
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
  const liveResultText = selectResultText(liveRaidRun?.result);
  const liveExplanation = selectResultExplanation(liveRaidRun?.result);
  const livePatch = selectResultPatch(liveRaidRun?.result);
  const liveArtifacts = selectArtifacts(liveRaidRun?.result);
  const liveWorkstreams = liveRaidRun?.result?.synthesizedOutput?.workstreams ?? [];
  const activeExperts = liveRaidRun?.status?.experts ?? [];
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
  const hasConversation = Boolean(lastSubmittedBrief || liveRaidRun || launchError);
  const conversationSignature = [
    lastSubmittedBrief ?? "",
    isLaunching ? "launching" : "idle",
    launchError ?? "",
    liveRaidRun?.spawn.raidId ?? "",
    activeRaidStatus ?? "",
    conversationSpecialists.map((specialist) => `${specialist.providerId}:${specialist.statusLabel}:${specialist.note}`).join("|"),
    liveWorkstreams.map((workstream) => `${workstream.id}:${workstream.summary}`).join("|"),
    liveResultText ?? "",
    liveExplanation ?? "",
    String(liveArtifacts.length),
    livePatch ?? "",
  ].join("::");

  useEffect(() => {
    if (!receiptCopied) {
      return;
    }

    const timer = window.setTimeout(() => setReceiptCopied(false), 1_200);
    return () => window.clearTimeout(timer);
  }, [receiptCopied]);

  useEffect(() => {
    if (!liveRaidRun || raidIsTerminal) {
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

  async function launchLiveRaid() {
    const submittedBrief = liveDemoBrief.trim();
    if (!submittedBrief || isLaunching || !canLaunchLiveRaid) {
      return;
    }

    setIsLaunching(true);
    setLaunchError(null);
    setLastSubmittedBrief(submittedBrief);
    setLiveRaidRun(null);
    setReceiptCopied(false);

    try {
      const response = await spawnDemoRaid(buildLiveDemoPayload(submittedBrief));
      if (!response.ok || !response.data) {
        if (response.status === 404) {
          throw new Error("Free demo raid is not enabled on this host. The paid native route stays at POST /v1/raid.");
        }

        if (response.status === 401) {
          throw new Error("Free demo raid is enabled, but the proxy is missing a valid demo token.");
        }

        if ((response.error ?? "").toLowerCase().includes("payment required")) {
          throw new Error(
            "This host sent /demo to the paid lane. The paid native route stays at POST /v1/raid.",
          );
        }

        throw new Error(response.error ?? `Raid launch failed with status ${response.status}.`);
      }

      const spawn = response.data;
      setLiveRaidRun({
        spawn,
        lastUpdatedAt: new Date().toISOString(),
        pollError: null,
      });

      await refreshLiveRaid(spawn);
    } catch (error) {
      setLaunchError(readErrorMessage(error));
    } finally {
      setIsLaunching(false);
    }
  }

  async function refreshLiveRaid(spawn: RaidSpawnOutput) {
    const [statusResult, resultResult] = await Promise.allSettled([
      fetchRaidStatus(spawn.raidId, spawn.raidAccessToken),
      fetchRaidResult(spawn.raidId, spawn.raidAccessToken),
    ]);

    setLiveRaidRun((current) => {
      if (!current || current.spawn.raidId !== spawn.raidId) {
        return current;
      }

      const nextStatus = statusResult.status === "fulfilled" ? statusResult.value : current.status;
      const nextResult = resultResult.status === "fulfilled" ? resultResult.value : current.result;
      const nextRaidStatus = nextStatus?.status ?? current.spawn.status;
      const pollError =
        statusResult.status === "rejected"
          ? readErrorMessage(statusResult.reason)
          : resultResult.status === "rejected" && isTerminalRaidStatus(nextRaidStatus)
            ? readErrorMessage(resultResult.reason)
            : null;

      return {
        ...current,
        status: nextStatus,
        result: nextResult,
        lastUpdatedAt: new Date().toISOString(),
        pollError,
      };
    });
  }

  async function copyReceiptLink() {
    if (!liveRaidRun) {
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
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void launchLiveRaid();
  }

  return (
    <section className="mercenary-demo" id="demo">
      <article className="mercenary-chat">
        <div className="mercenary-chat__topbar">
          <div className="mercenary-chat__identity">
            <strong>Mercenary</strong>
            <span>{liveRaidRun ? `${humanizeStatus(activeRaidStatus ?? "queued")} · ${availabilityLabel}` : availabilityLabel}</span>
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
            <p>Tell me what you want built. I’ll hire specialists in the background and return one final product here.</p>
          </ChatMessage>

          {lastSubmittedBrief ? (
            <ChatMessage label="You" role="user">
              <p>{lastSubmittedBrief}</p>
            </ChatMessage>
          ) : null}

          {isLaunching ? (
            <ChatMessage avatarSrc={heroImage} label="Mercenary" role="assistant">
              <p>Reviewing the request and opening a raid.</p>
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
                <StatusPill tone={raidIsTerminal ? "ready" : "working"}>{`status ${humanizeStatus(activeRaidStatus ?? "queued")}`}</StatusPill>
                <StatusPill tone="available">{`${liveRaidRun.spawn.selectedExperts} specialists invited`}</StatusPill>
                <StatusPill tone="available">{`eta ${liveRaidRun.spawn.estimatedFirstResultSec}s`}</StatusPill>
              </div>
              <p className="mercenary-message__note">{`Updated ${formatTimestamp(liveRaidRun.lastUpdatedAt)}`}</p>
              {liveRaidRun.pollError ? <p className="mercenary-message__note">Last refresh error: {liveRaidRun.pollError}</p> : null}
            </ChatMessage>
          ) : null}

          {conversationSpecialists.length > 0 ? (
            <ChatMessage avatarSrc={heroImage} label="Mercenary" role="assistant">
              <p>I hired these specialists for the current run.</p>
              <div className="mercenary-list">
                {conversationSpecialists.map((specialist) => (
                  <div className="mercenary-list__item" key={specialist.providerId}>
                    <div className="mercenary-list__copy">
                      <strong>{specialist.displayName}</strong>
                      <p>{specialist.note}</p>
                      {specialist.meta ? <small>{specialist.meta}</small> : null}
                    </div>
                    <StatusPill tone={specialist.statusTone}>{specialist.statusLabel}</StatusPill>
                  </div>
                ))}
              </div>
            </ChatMessage>
          ) : null}

          {liveWorkstreams.length > 0 ? (
            <ChatMessage avatarSrc={heroImage} label="Mercenary" role="assistant">
              <p>These scoped deliverables are coming back from the raid.</p>
              <div className="mercenary-list">
                {liveWorkstreams.map((workstream) => (
                  <div className="mercenary-list__item" key={workstream.id}>
                    <div className="mercenary-list__copy">
                      <strong>{workstream.label}</strong>
                      <p>{workstream.summary}</p>
                    </div>
                    <span className="mercenary-list__meta">{workstream.primaryType}</span>
                  </div>
                ))}
              </div>
            </ChatMessage>
          ) : null}

          {liveResultText || liveArtifacts.length > 0 || livePatch ? (
            <ChatMessage avatarSrc={heroImage} label="Mercenary" role="assistant" tone="success">
              {liveResultText ? <p className="mercenary-final__answer">{liveResultText}</p> : <p>Final delivery is ready.</p>}
              {liveExplanation ? <p>{liveExplanation}</p> : null}

              {liveArtifacts.length > 0 ? (
                <div className="mercenary-link-list">
                  {liveArtifacts.map((artifact) => (
                    <a
                      className="mercenary-link"
                      href={artifact.uri}
                      key={`${artifact.outputType}:${artifact.label}:${artifact.uri}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <strong>{artifact.label}</strong>
                      <span>{artifact.outputType}</span>
                    </a>
                  ))}
                </div>
              ) : null}

              {livePatch ? <pre className="code-panel mercenary-final__code">{livePatch}</pre> : null}
            </ChatMessage>
          ) : null}

          {liveRaidRun && raidIsTerminal && !liveResultText && liveArtifacts.length === 0 && !livePatch ? (
            <ChatMessage avatarSrc={heroImage} label="Mercenary" role="assistant" tone="error">
              <p>The raid finalized without an approved deliverable.</p>
            </ChatMessage>
          ) : null}
        </div>

        <div className="mercenary-composer">
          {!hasConversation ? (
            <div className="mercenary-composer__suggestions">
              {DEMO_PROMPTS.map((prompt) => (
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
              <button className="button button--primary" disabled={!canSendBrief} onClick={() => void launchLiveRaid()} type="button">
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
              <strong>Live state</strong>
            </div>
            <StatusPill tone={liveRaidRun ? (raidIsTerminal ? "ready" : "working") : canLaunchLiveRaid ? "ready" : "offline"}>
              {liveRaidRun ? humanizeStatus(activeRaidStatus ?? "queued") : "idle"}
            </StatusPill>
          </div>

          <div className="mercenary-sidebar__links">
            {liveRaidRun ? (
              <>
                <a className="mercenary-sidebar__link" href={liveRaidRun.spawn.receiptPath}>
                  <span>proof</span>
                  <strong>Receipt</strong>
                </a>
                <a className="mercenary-sidebar__link" href={buildAgentLogPath(liveRaidRun)} rel="noreferrer" target="_blank">
                  <span>trace</span>
                  <strong>Agent log</strong>
                </a>
                <button className="mercenary-sidebar__link mercenary-sidebar__link--button" onClick={() => void copyReceiptLink()} type="button">
                  <span>share</span>
                  <strong>{receiptCopied ? "Copied" : "Copy link"}</strong>
                </button>
              </>
            ) : (
              <p className="mercenary-sidebar__note">Mercenary will add proof links here after the first run starts.</p>
            )}
          </div>

          <div className="mercenary-sidebar__statline">
            <SidebarRow label="Ready" value={availabilityLabel} />
            <SidebarRow label="Invited" value={liveRaidRun ? String(liveRaidRun.spawn.selectedExperts) : "0"} />
            <SidebarRow label="Outputs" value={`${liveWorkstreams.length} / ${liveArtifacts.length}`} />
            <SidebarRow label="Updated" value={formatTimestamp(liveRaidRun?.lastUpdatedAt)} />
          </div>
        </section>

        <section className="mercenary-sidebar__panel">
          <div className="mercenary-sidebar__head">
            <div>
              <span className="mercenary-sidebar__eyebrow">Specialists</span>
              <strong>Roster</strong>
            </div>
          </div>

          <div className="mercenary-sidebar__specialists">
            {sidebarSpecialists.slice(0, 6).map((specialist) => (
              <div className="mercenary-sidebar__specialist" key={specialist.providerId}>
                <div className="mercenary-sidebar__specialist-copy">
                  <div className="mercenary-sidebar__specialist-label">
                    <span className={`mercenary-sidebar__dot mercenary-sidebar__dot--${specialist.statusTone}`} />
                    <strong>{specialist.displayName}</strong>
                  </div>
                  {specialist.meta ? <small>{specialist.meta}</small> : null}
                </div>
                <a className="mercenary-sidebar__micro-link" href="/raiders">
                  view
                </a>
              </div>
            ))}

            {sidebarSpecialists.length === 0 ? <p className="mercenary-sidebar__note">Waiting for provider registry data.</p> : null}
          </div>
        </section>
      </aside>
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
    <div className="mercenary-sidebar__metric">
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

function TypingDots() {
  return (
    <div className="mercenary-typing" aria-label="Mercenary is typing">
      <span />
      <span />
      <span />
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
    };
  });
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
  const status = run.status?.status ?? run.spawn.status;

  if (status === "queued") {
    return "I accepted the request and I’m matching it to live specialists.";
  }

  if (status === "running") {
    return "The raid is live. I’m collecting scoped specialist output and filtering weak branches.";
  }

  if (status === "final" && run.result?.synthesizedOutput) {
    return "The raid is final. I merged the strongest specialist outputs into one delivery.";
  }

  if (status === "final") {
    return "The raid is final, but no approved output was published.";
  }

  return `The raid is ${humanizeStatus(status)}.`;
}

function buildAgentLogPath(run: LiveRaidRun): string {
  return `${API_BASE}/v1/raids/${encodeURIComponent(run.spawn.raidId)}/agent_log.json?token=${encodeURIComponent(run.spawn.raidAccessToken)}`;
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

function selectResultExplanation(result: RaidResult | undefined): string | undefined {
  return result?.synthesizedOutput?.explanation ?? result?.primarySubmission?.submission.explanation;
}

function selectResultPatch(result: RaidResult | undefined): string | undefined {
  return result?.synthesizedOutput?.patchUnifiedDiff ?? result?.primarySubmission?.submission.patchUnifiedDiff;
}

function selectArtifacts(result: RaidResult | undefined) {
  return result?.synthesizedOutput?.artifacts ?? result?.primarySubmission?.submission.artifacts ?? [];
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
