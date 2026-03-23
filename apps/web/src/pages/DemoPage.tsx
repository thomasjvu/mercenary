import { useEffect, useState, type ReactNode } from "react";
import { DocsButton } from "@bossraid/ui";
import {
  API_BASE,
  fetchRaidResult,
  fetchRaidStatus,
  spawnRaid,
  type Provider,
  type ProviderHealth,
  type RaidResult,
  type RaidSpawnOutput,
  type RaidStatus as RaidStatusSnapshot,
} from "../api";
import { buildLiveDemoPayload, DEFAULT_LIVE_DEMO_BRIEF } from "../default-payload";

type AppRoute = "/" | "/demo" | "/raiders" | "/receipt";

type DemoPageProps = {
  onNavigate: (path: AppRoute) => void;
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

type LiveProviderRecord = {
  providerId: string;
  displayName: string;
  modelLabel: string;
  statusLabel: string;
  statusTone: "ready" | "available" | "offline";
  note: string;
};

const LIVE_POLL_INTERVAL_MS = 3_000;
const TERMINAL_RAID_STATUSES = new Set(["final", "cancelled", "expired"]);
const DEMO_PROMPTS = [
  "Build a one-room GB Studio microgame with one boss, one key, one exit, and a matching 12-second trailer.",
  "Create a fast retro launch package with a gameplay patch, pixel-art title card, sprite pack, and teaser copy.",
  "Ship a tiny arcade challenge with one enemy loop, one reward prop, and a trailer that matches the palette and hook.",
] as const;

export function DemoPage({ onNavigate, providers, providerHealth }: DemoPageProps) {
  const [liveDemoBrief, setLiveDemoBrief] = useState(DEFAULT_LIVE_DEMO_BRIEF);
  const [lastSubmittedBrief, setLastSubmittedBrief] = useState<string | null>(null);
  const [liveRaidRun, setLiveRaidRun] = useState<LiveRaidRun | null>(null);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [receiptCopied, setReceiptCopied] = useState(false);

  const healthByProviderId = new Map(providerHealth.map((entry) => [entry.providerId, entry]));
  const liveProviderRecords = buildLiveProviderRecords(providers, providerHealth, healthByProviderId);
  const readyProviderCount = providerHealth.filter((entry) => entry.reachable && entry.ready).length;
  const hostedProviderCount = providerHealth.length > 0 ? providerHealth.length : providers.length;
  const canLaunchLiveRaid = providerHealth.length === 0 || readyProviderCount > 0;
  const activeRaidStatus = liveRaidRun?.status?.status ?? liveRaidRun?.spawn.status;
  const raidIsTerminal = activeRaidStatus ? isTerminalRaidStatus(activeRaidStatus) : false;
  const liveResultText = selectResultText(liveRaidRun?.result);
  const liveExplanation = selectResultExplanation(liveRaidRun?.result);
  const livePatch = selectResultPatch(liveRaidRun?.result);
  const liveArtifacts = selectArtifacts(liveRaidRun?.result);
  const liveWorkstreams = liveRaidRun?.result?.synthesizedOutput?.workstreams ?? [];
  const activeExperts = liveRaidRun?.status?.experts ?? [];

  useEffect(() => {
    if (!receiptCopied) {
      return;
    }

    const timer = window.setTimeout(() => setReceiptCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [receiptCopied]);

  useEffect(() => {
    if (!liveRaidRun || raidIsTerminal) {
      return;
    }

    const pollTimer = window.setInterval(() => {
      void refreshLiveRaid(liveRaidRun.spawn, true);
    }, LIVE_POLL_INTERVAL_MS);

    return () => window.clearInterval(pollTimer);
  }, [liveRaidRun, raidIsTerminal]);

  async function launchLiveRaid() {
    const submittedBrief = liveDemoBrief.trim() || DEFAULT_LIVE_DEMO_BRIEF;
    setIsLaunching(true);
    setLaunchError(null);
    setLastSubmittedBrief(submittedBrief);

    try {
      const response = await spawnRaid(buildLiveDemoPayload(submittedBrief));
      if (!response.ok || !response.data) {
        if ((response.error ?? "").toLowerCase().includes("payment required")) {
          throw new Error(
            "Payment required. Set BOSSRAID_X402_ENABLED=false on the judge demo API, or route /demo to a non-x402 demo control plane.",
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

      await refreshLiveRaid(spawn, false);
    } catch (error) {
      setLaunchError(readErrorMessage(error));
    } finally {
      setIsLaunching(false);
    }
  }

  async function refreshLiveRaid(spawn: RaidSpawnOutput, quiet: boolean) {
    if (!quiet) {
      setIsRefreshing(true);
    }

    try {
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
    } finally {
      if (!quiet) {
        setIsRefreshing(false);
      }
    }
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

  return (
    <section className="demo-shell" id="demo">
      <div className="demo-shell__header">
        <div className="demo-shell__copy">
          <p className="eyebrow">live demo</p>
          <h1>Mercenary chat</h1>
          <p className="lede">Hosted raid orchestration, live provider status, and public proof links in one workspace.</p>
        </div>

        <div className="demo-shell__actions">
          <a
            className="button"
            href="/"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("/");
            }}
          >
            landing
          </a>
          <a
            className="button"
            href="/raiders"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("/raiders");
            }}
          >
            raiders
          </a>
          <a
            className="button"
            href="/receipt"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("/receipt");
            }}
          >
            receipt
          </a>
          <DocsButton className="button button--primary" label="docs" />
        </div>
      </div>

      <div className="demo-layout">
        <aside className="demo-sidebar">
          <section className="demo-rail-card demo-rail-card--primary">
            <p className="eyebrow">raid runtime</p>
            <div className="demo-rail-card__metric">
              <strong>{providerHealth.length > 0 ? `${readyProviderCount}/${providerHealth.length}` : "loading"}</strong>
              <span>hosted providers ready</span>
            </div>
            <p className="info-panel__note">The demo UI calls the public Boss Raid API. The API then checks and routes the hosted Phala workers.</p>
          </section>

          <section className="demo-rail-card">
            <p className="eyebrow">proof model</p>
            <p className="demo-rail-card__copy">One submitted mission brief creates one raid and one receipt.</p>
            <p className="demo-rail-card__copy">If you submit a second mission, that should become a second raid with a second receipt.</p>
          </section>

          <section className="demo-rail-card">
            <p className="eyebrow">hosted workers</p>
            <div className="demo-provider-list">
              {liveProviderRecords.length > 0 ? (
                liveProviderRecords.map((provider) => (
                  <div className="demo-provider-row" key={provider.providerId}>
                    <div>
                      <strong>{provider.displayName}</strong>
                      <p>{provider.note}</p>
                    </div>
                    <div className="demo-provider-meta">
                      <StatusPill tone={provider.statusTone}>{provider.statusLabel}</StatusPill>
                      <span>{provider.modelLabel}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="info-panel__note">Waiting for the public registry response.</p>
              )}
            </div>
          </section>

          <section className="demo-rail-card">
            <p className="eyebrow">proof links</p>
            {liveRaidRun ? (
              <div className="proof-link-list">
                <div className="proof-link-row">
                  <span>receipt</span>
                  <strong>
                    <a href={liveRaidRun.spawn.receiptPath}>public receipt for this raid</a>
                  </strong>
                  <p>{liveRaidRun.spawn.receiptPath}</p>
                </div>
                <div className="proof-link-row">
                  <span>agent log</span>
                  <strong>
                    <a href={buildAgentLogPath(liveRaidRun)} rel="noreferrer" target="_blank">
                      token-gated execution log
                    </a>
                  </strong>
                  <p>{buildAgentLogPath(liveRaidRun)}</p>
                </div>
                <div className="demo-sidebar__actions">
                  <button className="button" onClick={() => void copyReceiptLink()} type="button">
                    {receiptCopied ? "receipt copied" : "copy receipt"}
                  </button>
                  <a className="button button--primary" href={liveRaidRun.spawn.receiptPath}>
                    open receipt
                  </a>
                </div>
              </div>
            ) : (
              <p className="info-panel__note">Launch one raid to populate the receipt and agent-log links here.</p>
            )}
          </section>
        </aside>

        <article className="demo-chat-shell">
          <div className="demo-chat__head">
            <div className="demo-chat__copy">
              <p className="eyebrow">chat surface</p>
              <h2>Submit a raid brief.</h2>
              <p className="demo-chat__subcopy">Mercenary will fan it out to the hosted gameplay, art, and trailer workers and keep the latest raid state in-thread.</p>
            </div>
            <div className="demo-chat__badges">
              <StatusChip tone={canLaunchLiveRaid ? "proof" : "private"}>
                {providerHealth.length > 0 ? `ready ${readyProviderCount}/${providerHealth.length}` : "checking health"}
              </StatusChip>
              <StatusChip tone="muted">POST /v1/raid</StatusChip>
              <StatusChip tone="muted">{`providers ${hostedProviderCount || "loading"}`}</StatusChip>
            </div>
          </div>

          <div aria-live="polite" className="demo-chat__log">
            <DemoMessage label="Mercenary" role="system">
              <p>
                This page launches the real game-build raid payload through the public Boss Raid route and keeps the
                latest receipt path visible after launch.
              </p>
            </DemoMessage>

            <DemoMessage label="Boss Raid" role="assistant">
              <p>
                {providerHealth.length > 0
                  ? `${readyProviderCount} of ${providerHealth.length} hosted providers are ready right now.`
                  : "Loading the hosted provider health snapshot."}
              </p>
              <p>Start with the default GB Studio mission or paste a more specific launch brief below.</p>
            </DemoMessage>

            {lastSubmittedBrief ? (
              <DemoMessage label="You" role="user">
                <p>{lastSubmittedBrief}</p>
              </DemoMessage>
            ) : null}

            {launchError ? (
              <DemoMessage label="Boss Raid" role="assistant" tone="error">
                <p>{launchError}</p>
              </DemoMessage>
            ) : null}

            {liveRaidRun ? (
              <DemoMessage label="Mercenary" role="assistant">
                <p>{buildRaidStatusCopy(liveRaidRun)}</p>
                <div className="demo-message__row">
                  <StatusChip tone={raidIsTerminal ? "proof" : "private"}>{`status ${activeRaidStatus ?? "queued"}`}</StatusChip>
                  <StatusChip tone="proof">{`${liveRaidRun.spawn.selectedExperts} providers invited`}</StatusChip>
                  <StatusChip tone="muted">{`eta ${liveRaidRun.spawn.estimatedFirstResultSec}s`}</StatusChip>
                  <StatusChip tone="muted">{`risk ${liveRaidRun.spawn.sanitization.riskTier}`}</StatusChip>
                </div>
              </DemoMessage>
            ) : null}

            {activeExperts.length > 0 ? (
              <DemoMessage label="Mercenary" role="assistant">
                <p>Current provider branches:</p>
                <div className="demo-status-list">
                  {activeExperts.map((expert) => (
                    <div className="demo-status-row" key={expert.providerId}>
                      <strong>{expert.providerId}</strong>
                      <span>{expert.status}</span>
                      <small>{expert.message ?? "Mercenary is coordinating this branch."}</small>
                    </div>
                  ))}
                </div>
              </DemoMessage>
            ) : null}

            {liveWorkstreams.length > 0 ? (
              <DemoMessage label="Boss Raid" role="assistant">
                <p>Synthesized branches currently published for this raid:</p>
                <div className="demo-status-list">
                  {liveWorkstreams.map((workstream) => (
                    <div className="demo-status-row" key={workstream.id}>
                      <strong>{workstream.label}</strong>
                      <span>{workstream.primaryType}</span>
                      <small>{workstream.summary}</small>
                    </div>
                  ))}
                </div>
              </DemoMessage>
            ) : null}

            {liveResultText ? (
              <DemoMessage label="Boss Raid" role="assistant">
                <p>{liveResultText}</p>
                {liveExplanation ? <p>{liveExplanation}</p> : null}
                {livePatch ? <pre className="code-panel demo-message__code">{livePatch}</pre> : null}
              </DemoMessage>
            ) : null}

            {liveRaidRun && raidIsTerminal && !liveResultText ? (
              <DemoMessage label="Boss Raid" role="assistant" tone="error">
                <p>No approved provider output was published for this raid.</p>
                <p>Open the receipt and agent log from the side panel to inspect the failed run.</p>
              </DemoMessage>
            ) : null}
          </div>

          <div className="demo-composer">
            <div className="demo-suggestion-row">
              {DEMO_PROMPTS.map((prompt) => (
                <button
                  className={`demo-suggestion ${liveDemoBrief === prompt ? "demo-suggestion--active" : ""}`}
                  key={prompt}
                  onClick={() => setLiveDemoBrief(prompt)}
                  type="button"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <label className="receipt-field demo-composer__field">
              <span>mission brief</span>
              <textarea
                className="receipt-field__input demo-composer__textarea"
                onChange={(event) => setLiveDemoBrief(event.target.value)}
                placeholder="Describe the raid you want Mercenary to coordinate."
                spellCheck={false}
                value={liveDemoBrief}
              />
            </label>

            <div className="demo-composer__actions">
              <button className="button" onClick={() => setLiveDemoBrief(DEFAULT_LIVE_DEMO_BRIEF)} type="button">
                reset brief
              </button>
              <div className="demo-composer__action-group">
                {liveRaidRun ? (
                  <button
                    className="button"
                    disabled={isRefreshing}
                    onClick={() => void refreshLiveRaid(liveRaidRun.spawn, false)}
                    type="button"
                  >
                    {isRefreshing ? "refreshing..." : "refresh"}
                  </button>
                ) : null}
                <button
                  className="button button--primary"
                  disabled={isLaunching || !canLaunchLiveRaid}
                  onClick={() => void launchLiveRaid()}
                  type="button"
                >
                  {isLaunching ? "launching..." : "launch live raid"}
                </button>
              </div>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function DemoMessage({
  children,
  label,
  role,
  tone = "default",
}: {
  children: ReactNode;
  label: string;
  role: "assistant" | "system" | "user";
  tone?: "default" | "error";
}) {
  return (
    <article className={`demo-message demo-message--${role} ${tone === "error" ? "demo-message--error" : ""}`}>
      <span className="demo-message__meta">{label}</span>
      <div className="demo-message__bubble">{children}</div>
    </article>
  );
}

function StatusChip({ children, tone }: { children: string; tone: "proof" | "private" | "muted" }) {
  return <span className={`signal-chip signal-chip--${tone}`}>{children}</span>;
}

function StatusPill({ children, tone }: { children: string; tone: "ready" | "available" | "offline" }) {
  return <span className={`status-chip status-chip--${tone}`}>{children}</span>;
}

function buildLiveProviderRecords(
  providers: Provider[],
  providerHealth: ProviderHealth[],
  healthByProviderId: Map<string, ProviderHealth>,
): LiveProviderRecord[] {
  if (providers.length === 0) {
    return providerHealth.map((entry) => ({
      providerId: entry.providerId,
      displayName: entry.providerName ?? entry.providerId,
      modelLabel: entry.model ?? "model pending",
      statusLabel: entry.ready ? "ready" : entry.reachable ? "available" : "offline",
      statusTone: entry.ready ? "ready" : entry.reachable ? "available" : "offline",
      note: entry.error ?? entry.endpoint ?? "Waiting for provider metadata.",
    }));
  }

  return providers.map((provider) => {
    const health = healthByProviderId.get(provider.providerId);
    const statusTone = health?.ready ? "ready" : health?.reachable ? "available" : "offline";

    return {
      providerId: provider.providerId,
      displayName: provider.displayName,
      modelLabel: provider.modelFamily ?? health?.model ?? "model pending",
      statusLabel: health?.ready ? "ready" : health?.reachable ? "reachable" : "offline",
      statusTone,
      note:
        provider.specializations.length > 0
          ? provider.specializations.slice(0, 3).join(" / ")
          : health?.error ?? "Waiting for specialization metadata.",
    };
  });
}

function buildRaidStatusCopy(run: LiveRaidRun): string {
  const status = run.status?.status ?? run.spawn.status;
  const expertCount = run.spawn.selectedExperts;

  if (status === "final" && run.result?.synthesizedOutput) {
    return `Raid ${shortValue(run.spawn.raidId)} finalized with one synthesized result assembled from ${expertCount} invited providers.`;
  }

  if (status === "final") {
    return `Raid ${shortValue(run.spawn.raidId)} reached final state without approved output. Check the receipt and agent log.`;
  }

  return `Raid ${shortValue(run.spawn.raidId)} is ${status}. Mercenary is still coordinating the hosted provider branches.`;
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

function shortValue(value: string): string {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 10)}...${value.slice(-6)}`;
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

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}
