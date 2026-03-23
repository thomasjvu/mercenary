import { startTransition, useDeferredValue, useEffect, useState, type CSSProperties } from "react";
import { DocsButton } from "@bossraid/ui";
import useSWR from "swr";
import {
  createOpsSession,
  deleteOpsSession,
  fetchOpsSessionStatus,
  fetchJson,
  type OpsSessionStatus,
  type Provider,
  type ProviderHealth,
  type RaidListItem,
  type RankedSubmission,
  type RaidResult,
  type RaidStatus,
} from "./api";
import { DEFAULT_SPAWN_PAYLOAD } from "./default-payload";

type RoutingDecision = NonNullable<RaidResult["routingProof"]>["providers"][number];
type SubmissionArtifact = NonNullable<NonNullable<RaidResult["synthesizedOutput"]>["artifacts"]>[number];

function formatMs(value?: number): string {
  return value == null ? "n/a" : `${value} ms`;
}

function formatUsd(value?: number): string {
  return value == null ? "$0.00" : `$${value.toFixed(2)}`;
}

function formatScore(value?: number): string {
  return value == null ? "0.00" : value.toFixed(2);
}

function formatTimestamp(value?: string): string {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function App() {
  const [adminTokenInput, setAdminTokenInput] = useState("");
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [raidId, setRaidId] = useState<string | null>(null);
  const [spawnPending, setSpawnPending] = useState(false);
  const [actionPending, setActionPending] = useState<"abort" | "replay" | null>(null);
  const [receiptCopied, setReceiptCopied] = useState(false);
  const [providerQuery, setProviderQuery] = useState("");
  const [spawnPayload, setSpawnPayload] = useState(DEFAULT_SPAWN_PAYLOAD);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const deferredProviderQuery = useDeferredValue(providerQuery);
  const opsSession = useSWR<OpsSessionStatus>("ops-session", fetchOpsSessionStatus, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });
  const opsReady = opsSession.data?.authenticated === true;

  const health = useSWR<{ ok: boolean; providers: number; readyProviders: number }>(
    opsReady ? "/health" : null,
    (path: string) => fetchJson(path),
    { refreshInterval: 5_000 },
  );
  const raids = useSWR<RaidListItem[]>(opsReady ? "/v1/raids" : null, (path: string) => fetchJson(path), {
    refreshInterval: 3_000,
  });
  const providers = useSWR<Provider[]>(opsReady ? "/v1/providers" : null, (path: string) => fetchJson(path), {
    refreshInterval: 8_000,
  });
  const providerHealth = useSWR<ProviderHealth[]>(opsReady ? "/v1/providers/health" : null, (path: string) => fetchJson(path), {
    refreshInterval: 8_000,
  });
  const raidStatus = useSWR<RaidStatus>(
    opsReady && raidId ? `/v1/raids/${raidId}` : null,
    (path: string) => fetchJson(path),
    { refreshInterval: raidId ? 1_000 : 0 },
  );
  const raidResult = useSWR<RaidResult>(
    opsReady && raidId ? `/v1/raids/${raidId}/result` : null,
    (path: string) => fetchJson(path),
    { refreshInterval: raidId ? 1_200 : 0 },
  );

  useEffect(() => {
    if (raidStatus.data?.status === "final" || raidStatus.data?.status === "cancelled") {
      void raidStatus.mutate();
      void raidResult.mutate();
      void raids.mutate();
    }
  }, [raidResult, raidStatus, raids]);

  useEffect(() => {
    if (!opsReady) {
      setRaidId(null);
      return;
    }

    if (!raidId && raids.data?.length) {
      setRaidId(raids.data[0].raidId);
      return;
    }

    if (raidId && raids.data && !raids.data.some((raid) => raid.raidId === raidId)) {
      setRaidId(raids.data[0]?.raidId ?? null);
    }
  }, [opsReady, raidId, raids.data]);

  useEffect(() => {
    if (!receiptCopied) {
      return;
    }

    const timer = window.setTimeout(() => setReceiptCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [receiptCopied]);

  async function handleSpawnRaid() {
    setSpawnPending(true);
    setSpawnError(null);

    try {
      const payload = JSON.parse(spawnPayload) as unknown;
      const spawn = await fetchJson<{ raidId: string }>("/v1/raid", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      startTransition(() => setRaidId(spawn.raidId));
      void Promise.all([raids.mutate(), raidStatus.mutate(), raidResult.mutate()]);
    } catch (error) {
      setSpawnError(error instanceof Error ? error.message : "Launch failed.");
    } finally {
      setSpawnPending(false);
    }
  }

  async function handleOpsLogin() {
    if (adminTokenInput.trim().length === 0) {
      setAuthError("Admin token is required.");
      return;
    }

    setAuthPending(true);
    setAuthError(null);

    try {
      await createOpsSession(adminTokenInput.trim());
      setAdminTokenInput("");
      await Promise.all([
        opsSession.mutate(),
        health.mutate(),
        raids.mutate(),
        providers.mutate(),
        providerHealth.mutate(),
      ]);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Ops login failed.");
    } finally {
      setAuthPending(false);
    }
  }

  async function handleOpsLogout() {
    setAuthPending(true);
    setAuthError(null);

    try {
      await deleteOpsSession();
      setRaidId(null);
      await opsSession.mutate({ authenticated: false }, false);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Ops logout failed.");
    } finally {
      setAuthPending(false);
    }
  }

  async function handleAbortRaid() {
    if (!raidId) {
      return;
    }
    setActionPending("abort");
    try {
      await fetchJson(`/v1/raids/${raidId}/abort`, { method: "POST" });
      await Promise.all([raidStatus.mutate(), raidResult.mutate(), raids.mutate()]);
    } finally {
      setActionPending(null);
    }
  }

  async function handleReplayEvaluation() {
    if (!raidId) {
      return;
    }
    setActionPending("replay");
    try {
      await fetchJson(`/v1/evaluations/${raidId}/replay`, { method: "POST" });
      await Promise.all([raidStatus.mutate(), raidResult.mutate(), raids.mutate()]);
    } finally {
      setActionPending(null);
    }
  }

  async function handleCopyReceipt() {
    const receipt = {
      raid: selectedRaid,
      status: raidStatus.data,
      result: raidResult.data,
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(receipt, null, 2));
      setReceiptCopied(true);
    } catch {
      setReceiptCopied(false);
    }
  }

  const selectedRaid = (raids.data ?? []).find((raid) => raid.raidId === raidId) ?? raids.data?.[0];
  const filteredProviders = (providers.data ?? []).filter((provider) => {
    const query = deferredProviderQuery.trim().toLowerCase();
    if (!query) {
      return true;
    }

    return (
      provider.displayName.toLowerCase().includes(query) ||
      provider.specializations.some((item) => item.toLowerCase().includes(query)) ||
      provider.modelFamily?.toLowerCase().includes(query) === true
    );
  });

  const activeProviders = (providers.data ?? []).filter((provider) => provider.status === "available");
  const approvedProviders = raidResult.data?.settlementExecution?.successfulProviderIds.length
    ? raidResult.data.settlementExecution.successfulProviderIds
    : raidResult.data?.synthesizedOutput?.contributingProviderIds.length
      ? raidResult.data.synthesizedOutput.contributingProviderIds
    : (raidResult.data?.approvedSubmissions ?? []).map((submission) => submission.submission.providerId);
  const canAbort = raidStatus.data && !["final", "cancelled", "expired"].includes(raidStatus.data.status);
  const canReplay = raidStatus.data && ["first_valid", "final"].includes(raidStatus.data.status);
  const dangerState = (health.data?.readyProviders ?? 0) === 0;
  const runningState = raidStatus.data?.status === "running" || raidStatus.data?.status === "evaluating";
  const expertStates = raidStatus.data?.experts ?? [];
  const engagedExperts = expertStates.filter((expert) => !["timed_out", "failed", "invalid"].includes(expert.status)).length;
  const providerTotal = Math.max(health.data?.providers ?? providers.data?.length ?? 0, 6);
  const activeRaidId = selectedRaid?.raidId ?? "no active raid";
  const rankedSubmissions = raidResult.data?.rankedSubmissions ?? [];
  const synthesizedOutput = raidResult.data?.synthesizedOutput;
  const synthesizedWorkstreams = synthesizedOutput?.workstreams ?? [];
  const synthesizedArtifacts = synthesizedOutput?.artifacts ?? [];
  const routingProof = raidResult.data?.routingProof;
  const routingDecisions = routingProof?.providers ?? [];
  const settlementExecution = raidResult.data?.settlementExecution;
  const reputationEvents = raidResult.data?.reputationEvents ?? [];
  const erc8004ProviderCount = countUniqueProviders(routingDecisions, (decision) => decision.erc8004Registered);
  const veniceProviderCount = countUniqueProviders(routingDecisions, (decision) => decision.veniceBacked);
  const trustScoredProviderCount = countUniqueProviders(routingDecisions, (decision) => decision.trustScore > 0);
  const authMessage = authError ?? (opsSession.error instanceof Error ? opsSession.error.message : null);

  if (!opsReady) {
    return (
      <main className="ops-shell ops-shell--locked">
        <div className="ops-bg-grid" aria-hidden="true" />
        <section className="ops-auth-card">
          <div className="ops-auth-card__copy">
            <p className="ops-label">Boss Raid Ops</p>
            <h1>Unlock the internal control plane.</h1>
            <p className="ops-lede">
              Use the server-side ops session. The browser no longer ships a reusable admin bearer in the bundle.
            </p>
          </div>

          <form
            className="ops-auth-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleOpsLogin();
            }}
          >
            <label className="ops-auth-field">
              <span className="ops-label">admin token</span>
              <input
                autoComplete="current-password"
                className="search ops-auth-input"
                onChange={(event) => setAdminTokenInput(event.target.value)}
                placeholder="paste BOSSRAID_ADMIN_TOKEN"
                type="password"
                value={adminTokenInput}
              />
            </label>
            <div className="ops-auth-actions">
              <button className="button button--primary" disabled={authPending} type="submit">
                {authPending ? "unlocking" : "unlock ops"}
              </button>
              <DocsButton className="button ops-docs-link" />
            </div>
            {authMessage ? <p className="error-note">{authMessage}</p> : <p className="quiet-note">Session cookie lifetime follows the API runtime TTL.</p>}
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="ops-shell">
      <div className="ops-bg-grid" aria-hidden="true" />
      <section className="ops-hero">
        <div className="ops-hero__copy">
          <div className="ops-hero__intro">
            <div className="ops-brand">
              <p className="ops-label">Boss Raid Ops</p>
              <p className="ops-subbrand">mercenary-v1 / internal surface</p>
            </div>
            <div className="ops-stat-row">
              <StatChip label="core" value={health.data?.ok ? "online" : "offline"} />
              <StatChip label="ready" value={String(health.data?.readyProviders ?? 0)} />
              <StatChip label="live" value={String(activeProviders.length)} />
              <StatChip label="raids" value={String(raids.data?.length ?? 0)} />
            </div>
          </div>

          <h1>
            <span className="ops-headline-line">Command the mesh.</span>
            <span className="ops-headline-line">
              <span className="ops-headline-accent">Mercenary</span> routes the raid.
            </span>
            <span className="ops-headline-line">Ops tracks proof, payout, and readiness.</span>
          </h1>

          <p className="ops-lede">
            Use the raid-native surface to launch work, inspect live provider movement, and settle only approved outputs.
          </p>

          <div className="ops-hero__action-row">
            <div className="ops-actions">
              <button className="button button--primary" disabled={spawnPending} onClick={handleSpawnRaid} type="button">
                {spawnPending ? "launching" : "launch raid"}
              </button>
              <button className="button" disabled={!canReplay || actionPending != null} onClick={handleReplayEvaluation} type="button">
                {actionPending === "replay" ? "replaying" : "re-score"}
              </button>
              <button className="button button--danger" disabled={!canAbort || actionPending != null} onClick={handleAbortRaid} type="button">
                {actionPending === "abort" ? "aborting" : "abort"}
              </button>
              <button className="button" disabled={authPending} onClick={handleOpsLogout} type="button">
                {authPending ? "locking" : "lock ops"}
              </button>
              <DocsButton className="button ops-docs-link" />
            </div>
            <SignalMeter className="ops-hero__meter" value={health.data?.readyProviders ?? 0} total={providerTotal} />
          </div>

          <section className="ops-metrics" aria-label="Raid metrics">
            <Metric label="status" value={raidStatus.data?.status ?? selectedRaid?.status ?? "idle"} />
            <Metric label="approved" value={String(approvedProviders.length)} />
            <Metric label="split" value={formatUsd(raidResult.data?.settlement?.payoutPerSuccessfulProvider)} />
            <Metric label="risk" value={raidStatus.data?.sanitization.riskTier ?? "n/a"} />
          </section>
        </div>

        <div className="ops-hero__art" aria-hidden="true">
          <div className="ops-window-stack">
            <article className="ops-window ops-window--front">
              <div className="ops-window__head">
                <div>
                  <p className="ops-label">mesh</p>
                  <h2>Live provider field</h2>
                </div>
                <SignalTag
                  label={runningState ? "mesh live" : "mesh idle"}
                  variant={runningState ? "internal" : "default"}
                  blinking={runningState}
                />
              </div>
              <div className="ops-window__body">
                <MeshActivity
                  providers={providers.data ?? []}
                  providerHealth={providerHealth.data ?? []}
                  experts={raidStatus.data?.experts ?? []}
                />
              </div>
            </article>

            <article className="ops-window ops-window--back">
              <div className="ops-window__head">
                <div>
                  <p className="ops-label">raid snapshot</p>
                  <h2>{activeRaidId}</h2>
                </div>
                <SignalTag
                  label={dangerState ? "limits" : "stable"}
                  variant={dangerState ? "danger" : "default"}
                  blinking={dangerState}
                />
              </div>
              <div className="snapshot-grid">
                <SnapshotRow label="status" value={raidStatus.data?.status ?? selectedRaid?.status ?? "idle"} />
                <SnapshotRow label="created" value={formatTimestamp(selectedRaid?.createdAt)} />
                <SnapshotRow label="experts" value={String(engagedExperts)} />
                <SnapshotRow label="approved" value={String(approvedProviders.length)} />
                <SnapshotRow label="risk" value={raidStatus.data?.sanitization.riskTier ?? "n/a"} />
                <SnapshotRow label="updated" value={formatTimestamp(selectedRaid?.updatedAt)} />
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="ops-workbench">
        <div className="ops-column">
          <article className="ops-panel ops-panel--queue">
            <div className="panel-head">
              <div>
                <p className="ops-label">raid queue</p>
                <h3>Current raids</h3>
              </div>
              <SignalTag label="internal" variant="internal" />
            </div>
            <div className="raid-list">
              {(raids.data ?? []).slice(0, 8).map((raid) => (
                <button
                  key={raid.raidId}
                  className={`raid-list__item ${raid.raidId === raidId ? "raid-list__item--active" : ""}`}
                  onClick={() => setRaidId(raid.raidId)}
                  type="button"
                >
                  <strong>{raid.raidId}</strong>
                  <span>{raid.status}</span>
                  <small>{formatTimestamp(raid.updatedAt)}</small>
                </button>
              ))}
              {!raids.data?.length ? <p className="quiet-note">No raids yet.</p> : null}
            </div>
            </article>

          <article className="ops-panel ops-panel--timeline">
            <div className="panel-head">
              <div>
                <p className="ops-label">timeline</p>
                <h3>Provider movement</h3>
              </div>
            </div>
            <div className="timeline">
              {expertStates.slice(0, 8).map((expert) => (
                <div className="timeline-row" key={expert.providerId}>
                  <div>
                    <strong>{expert.providerId}</strong>
                    <span>{expert.message ?? "awaiting work"}</span>
                  </div>
                  <div className="timeline-meta">
                    <span>{expert.status}</span>
                    <span>{formatMs(expert.latencyMs)}</span>
                  </div>
                </div>
              ))}
              {expertStates.length === 0 ? <p className="quiet-note">No provider movement yet.</p> : null}
            </div>
          </article>
        </div>

        <div className="ops-column">
          <article className="ops-panel ops-panel--payload">
              <div className="panel-head">
                <div>
                  <p className="ops-label">payload</p>
                  <h3>Launch spec</h3>
                </div>
                <DocsButton className="button ops-docs-button ops-docs-button--compact" />
              </div>
              <textarea
                className="payload-editor"
                spellCheck={false}
                value={spawnPayload}
                onChange={(event) => setSpawnPayload(event.target.value)}
              />
              {spawnError ? <p className="error-note">{spawnError}</p> : <p className="quiet-note">Native raid request body.</p>}
            </article>

            <article className="ops-panel ops-panel--output">
              <div className="panel-head">
                <div>
                  <p className="ops-label">synthesized output</p>
                  <h3>
                    {synthesizedOutput?.contributingProviderIds.length
                      ? `${synthesizedOutput.contributingProviderIds.length} contributors`
                      : "Pending"}
                  </h3>
                </div>
              </div>
              <div className="result-preview">
                {synthesizedOutput?.answerText ? (
                  <p>{synthesizedOutput.answerText}</p>
                ) : synthesizedOutput?.explanation ? (
                  <p>{synthesizedOutput.explanation}</p>
                ) : raidResult.data?.primarySubmission?.submission.answerText ? (
                  <p>{raidResult.data.primarySubmission.submission.answerText}</p>
                ) : raidResult.data?.primarySubmission?.submission.explanation ? (
                  <p>{raidResult.data.primarySubmission.submission.explanation}</p>
                ) : (
                  <p className="quiet-note">No approved output yet.</p>
                )}
              </div>
              {synthesizedOutput?.patchUnifiedDiff ? (
                <pre className="diff-preview">{synthesizedOutput.patchUnifiedDiff}</pre>
              ) : raidResult.data?.primarySubmission?.submission.patchUnifiedDiff ? (
                <pre className="diff-preview">{raidResult.data.primarySubmission.submission.patchUnifiedDiff}</pre>
              ) : null}
              {synthesizedArtifacts.length ? <ArtifactStrip artifacts={synthesizedArtifacts} /> : null}
              {synthesizedWorkstreams.length ? (
                <div className="scoreboard">
                  {synthesizedWorkstreams.map((workstream) => (
                    <WorkstreamCard key={workstream.id} workstream={workstream} />
                  ))}
                </div>
              ) : null}
            </article>
        </div>
      </section>

      <section className="ops-proof">
        <article className="ops-panel ops-panel--receipt">
          <div className="panel-head">
            <div>
              <p className="ops-label">receipt</p>
              <h3>Proof and settlement</h3>
            </div>
            <button className="button" onClick={handleCopyReceipt} type="button">
              {receiptCopied ? "copied" : "copy receipt"}
            </button>
          </div>
          <div className="receipt-grid">
            <ReceiptRow label="raid" value={activeRaidId} />
            <ReceiptRow label="status" value={raidResult.data?.status ?? selectedRaid?.status ?? "idle"} />
            <ReceiptRow label="approved" value={String(approvedProviders.length)} />
            <ReceiptRow label="privacy mode" value={routingProof?.policy.privacyMode ?? "pending"} />
            <ReceiptRow label="selection" value={routingProof?.policy.selectionMode ?? "pending"} />
            <ReceiptRow label="venice lane" value={routingProof?.policy.venicePrivateLane ? "active" : "off"} />
            <ReceiptRow label="8004 required" value={routingProof?.policy.requireErc8004 ? "yes" : "no"} />
            <ReceiptRow
              label="min trust"
              value={routingProof?.policy.minTrustScore == null ? "none" : String(routingProof.policy.minTrustScore)}
            />
            <ReceiptRow label="venice routed" value={String(veniceProviderCount)} />
            <ReceiptRow label="8004 routed" value={String(erc8004ProviderCount)} />
            <ReceiptRow label="trust scored" value={String(trustScoredProviderCount)} />
            <ReceiptRow label="mode" value={settlementExecution?.mode ?? "pending"} />
            <ReceiptRow label="proof" value={settlementExecution?.proofStandard ?? "pending"} />
            <ReceiptRow label="artifact" value={settlementExecution?.artifactPath ?? "pending"} />
            <ReceiptRow label="registry" value={settlementExecution?.registryRaidRef ?? "pending"} />
            <ReceiptRow label="registry contract" value={settlementExecution?.contracts.registryAddress ?? "pending"} />
            <ReceiptRow label="escrow contract" value={settlementExecution?.contracts.escrowAddress ?? "pending"} />
            <ReceiptRow label="task hash" value={settlementExecution?.taskHash ?? "pending"} />
            <ReceiptRow label="evaluation hash" value={settlementExecution?.evaluationHash ?? "pending"} />
          </div>

          <div className="receipt-list">
            <div className="receipt-list__section">
              <strong>routing proof</strong>
              {routingDecisions.length ? (
                routingDecisions.map((decision) => (
                  <div
                    className="receipt-row"
                    key={`${decision.providerId}-${decision.workstreamId ?? "root"}-${decision.phase}`}
                  >
                    <span>{decision.providerId}</span>
                    <span>{buildRoutingDecisionSummary(decision)}</span>
                  </div>
                ))
              ) : (
                <p className="quiet-note">No routing proof recorded yet.</p>
              )}
            </div>

            <div className="receipt-list__section">
              <strong>allocations</strong>
              {settlementExecution?.allocations.length ? (
                settlementExecution.allocations.map((allocation) => (
                  <div className="receipt-row" key={`${allocation.providerId}-${allocation.role}`}>
                    <span>{allocation.providerId}</span>
                    <span>
                      {allocation.role} · {allocation.status} · {formatUsd(allocation.totalAmount)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="quiet-note">No settlement allocation yet.</p>
              )}
            </div>

            <div className="receipt-list__section">
              <strong>transactions</strong>
              {settlementExecution?.transactionHashes?.length ? (
                settlementExecution.transactionHashes.map((hash) => (
                  <div className="receipt-row" key={hash}>
                    <span>tx</span>
                    <span>{hash}</span>
                  </div>
                ))
              ) : (
                <p className="quiet-note">No onchain transaction yet.</p>
              )}
            </div>

            <div className="receipt-list__section">
              <strong>child jobs</strong>
              {settlementExecution?.childJobs.length ? (
                settlementExecution.childJobs.map((job) => (
                  <div className="receipt-row" key={job.jobRef}>
                    <span>{job.providerId}</span>
                    <span>
                      {job.role} · {job.status} · {job.jobId ?? job.syntheticJobId ?? "pending"}
                    </span>
                  </div>
                ))
              ) : (
                <p className="quiet-note">No child-job proof yet.</p>
              )}
            </div>

            <div className="receipt-list__section">
              <strong>reputation events</strong>
              {reputationEvents.length ? (
                reputationEvents.map((event) => (
                  <div className="receipt-row" key={`${event.providerId}-${event.type}-${event.timestamp}`}>
                    <span>{event.providerId}</span>
                    <span>
                      {event.type} · {formatTimestamp(event.timestamp)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="quiet-note">No reputation events recorded yet.</p>
              )}
            </div>
          </div>
        </article>

        <article className="ops-panel ops-panel--scoreboard">
          <div className="panel-head">
            <div>
              <p className="ops-label">ranking</p>
              <h3>Contribution scoreboard</h3>
            </div>
            <SignalTag label={`${rankedSubmissions.length} seen`} variant="internal" />
          </div>
          <div className="scoreboard">
            {rankedSubmissions.length ? (
              rankedSubmissions.map((entry) => (
                <ScoreCard key={`${entry.submission.providerId}-${entry.rank}`} entry={entry} />
              ))
            ) : (
              <p className="quiet-note">No ranked submissions yet.</p>
            )}
          </div>
        </article>
      </section>

      <section className="ops-registry">
        <article className="ops-panel ops-panel--providers">
          <div className="panel-head">
            <div>
              <p className="ops-label">providers</p>
              <h3>Registry</h3>
            </div>
            <input
              className="search"
              placeholder="search"
              value={providerQuery}
              onChange={(event) => {
                const nextValue = event.target.value;
                startTransition(() => setProviderQuery(nextValue));
              }}
            />
          </div>
          <div className="provider-list">
            {filteredProviders.slice(0, 10).map((provider) => (
              <ProviderRow
                key={provider.providerId}
                provider={provider}
                health={providerHealth.data?.find((item) => item.providerId === provider.providerId)}
              />
            ))}
            {filteredProviders.length === 0 ? <p className="quiet-note">No providers match.</p> : null}
          </div>
        </article>
      </section>
    </main>
  );
}

function countUniqueProviders(
  decisions: RoutingDecision[],
  predicate: (decision: RoutingDecision) => boolean,
): number {
  let count = 0;
  const grouped = new Map<string, RoutingDecision[]>();

  for (const decision of decisions) {
    const existing = grouped.get(decision.providerId) ?? [];
    existing.push(decision);
    grouped.set(decision.providerId, existing);
  }

  for (const providerDecisions of grouped.values()) {
    if (providerDecisions.some(predicate)) {
      count += 1;
    }
  }

  return count;
}

function buildRoutingDecisionSummary(decision: RoutingDecision): string {
  const workstream = decision.workstreamLabel && decision.roleLabel
    ? `${decision.workstreamLabel} / ${decision.roleLabel}`
    : decision.workstreamLabel ?? decision.roleLabel ?? "root raid";
  const privacySignals = [
    decision.veniceBacked ? "venice" : null,
    decision.erc8004Registered ? "8004" : "8004 pending",
    decision.registrationTx ? `reg ${shortValue(decision.registrationTx)}` : null,
    decision.trustScore > 0 ? `trust ${decision.trustScore}` : null,
    decision.privacyFeatures.includes("no_data_retention") ? "no-retention" : null,
    decision.privacyFeatures.includes("tee_attested") ? "tee" : null,
  ].filter((value): value is string => value != null);
  const reasons = decision.reasons
    .filter((reason) => !["selected_primary", "reserved_fallback", "workstream_scoped"].includes(reason))
    .map((reason) => reason.replaceAll("_", " "))
    .join(" / ");

  return [
    `${decision.phase} · ${workstream}`,
    privacySignals.join(" · "),
    reasons ? `why ${reasons}` : null,
  ]
    .filter((value): value is string => value != null && value.length > 0)
    .join(" · ");
}

function shortValue(value: string): string {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="receipt-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="snapshot-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ScoreCard({ entry }: { entry: RankedSubmission }) {
  const breakdown = entry.breakdown;
  const roleLabel = entry.submission.contributionRole?.label;
  const workstreamLabel = entry.submission.contributionRole?.workstreamLabel;
  const contributionLabel =
    workstreamLabel && roleLabel ? `${workstreamLabel} / ${roleLabel}` : workstreamLabel ?? roleLabel;

  return (
    <article className="scorecard">
      <div className="scorecard__head">
        <div>
          <span className="ops-label">rank {entry.rank}</span>
          <h3>{entry.submission.providerId}</h3>
          {contributionLabel ? <p className="quiet-note">{contributionLabel}</p> : null}
        </div>
        <SignalTag label={breakdown.valid ? "approved" : "rejected"} variant={breakdown.valid ? "default" : "danger"} />
      </div>
      <div className="scorecard__metrics">
        <span>final {formatScore(breakdown.finalScore)}</span>
        <span>build {formatScore(breakdown.buildScore)}</span>
        <span>tests {formatScore(breakdown.testScore)}</span>
        <span>latency {formatScore(breakdown.latencyScore)}</span>
      </div>
      <p className="scorecard__summary">{breakdown.summary ?? "No evaluation summary yet."}</p>
      {entry.submission.artifacts?.length ? <ArtifactStrip artifacts={entry.submission.artifacts} compact /> : null}
      {breakdown.invalidReasons.length ? (
        <div className="scorecard__issues">
          {breakdown.invalidReasons.map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function WorkstreamCard({
  workstream,
}: {
  workstream: NonNullable<RaidResult["synthesizedOutput"]>["workstreams"][number];
}) {
  return (
    <article className="scorecard">
      <div className="scorecard__head">
        <div>
          <span className="ops-label">workstream</span>
          <h3>{workstream.label}</h3>
          <p className="quiet-note">{workstream.roleLabels.join(" / ") || workstream.objective}</p>
        </div>
        <SignalTag label={`${workstream.contributingProviderIds.length} providers`} variant="internal" />
      </div>
      <p className="scorecard__summary">{workstream.summary}</p>
      {workstream.artifacts?.length ? <ArtifactStrip artifacts={workstream.artifacts} compact /> : null}
    </article>
  );
}

function ArtifactStrip({
  artifacts,
  compact = false,
}: {
  artifacts: SubmissionArtifact[];
  compact?: boolean;
}) {
  const visibleArtifacts = compact ? artifacts.slice(0, 3) : artifacts;

  return (
    <div
      style={{
        display: "grid",
        gap: "0.75rem",
        gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
        marginTop: "1rem",
      }}
    >
      {visibleArtifacts.map((artifact) => (
        <article className="scorecard" key={`${artifact.outputType}-${artifact.uri}`} style={{ gap: "0.6rem" }}>
          {isRenderableImageArtifact(artifact) ? (
            <img
              alt={artifact.label}
              loading="lazy"
              src={artifact.uri}
              style={{
                width: "100%",
                maxHeight: compact ? "120px" : "220px",
                objectFit: "cover",
                borderRadius: "0.9rem",
              }}
            />
          ) : null}
          {isRenderableVideoArtifact(artifact) ? (
            <video
              controls
              preload="metadata"
              src={artifact.uri}
              style={{
                width: "100%",
                maxHeight: compact ? "150px" : "240px",
                borderRadius: "0.9rem",
              }}
            />
          ) : null}
          <div>
            <span className="ops-label">{artifact.mimeType ? `${artifact.outputType} · ${artifact.mimeType}` : artifact.outputType}</span>
            <h3>{artifact.label}</h3>
            {!compact && artifact.description ? <p className="scorecard__summary">{artifact.description}</p> : null}
            <p className="quiet-note">
              <a href={artifact.uri} rel="noreferrer" target="_blank">
                {compact ? "open artifact" : shortValue(artifact.uri)}
              </a>
              {artifact.sha256 ? ` · sha ${shortValue(artifact.sha256)}` : ""}
            </p>
          </div>
        </article>
      ))}
      {artifacts.length > visibleArtifacts.length ? (
        <p className="quiet-note">+{artifacts.length - visibleArtifacts.length} more artifact refs</p>
      ) : null}
    </div>
  );
}

function isRenderableImageArtifact(artifact: SubmissionArtifact): boolean {
  return artifact.outputType === "image" || (artifact.mimeType?.startsWith("image/") ?? false);
}

function isRenderableVideoArtifact(artifact: SubmissionArtifact): boolean {
  return artifact.outputType === "video" || (artifact.mimeType?.startsWith("video/") ?? false);
}

function ProviderRow({
  provider,
  health,
}: {
  provider: Provider;
  health: ProviderHealth | undefined;
}) {
  const readyState = health?.ready ? "ready" : health?.reachable ? "warm" : "down";

  return (
    <div className="provider-row">
      <div className="provider-row__main">
        <strong>{provider.displayName}</strong>
        <span>
          {provider.modelFamily ?? "unknown"} · {provider.outputTypes?.join(" / ") || "n/a"}
        </span>
      </div>
      <div className="provider-row__scores">
        <span>rep {provider.scores?.reputationScore ?? 0}</span>
        <span>priv {provider.scores?.privacyScore ?? 0}</span>
        <span className={`status-dot status-dot--${readyState}`}>{readyState}</span>
      </div>
    </div>
  );
}

function SignalTag({
  label,
  variant,
  blinking = false,
}: {
  label: string;
  variant: "default" | "danger" | "internal";
  blinking?: boolean;
}) {
  return <span className={`signal-tag signal-tag--${variant} ${blinking ? "signal-tag--blink" : ""}`}>{label}</span>;
}

function SignalMeter({
  value,
  total,
  className,
}: {
  value: number;
  total: number;
  className?: string;
}) {
  const segments = Math.max(total, 6);
  const filled = Math.min(value, segments);

  return (
    <div className={className ? `signal-meter ${className}` : "signal-meter"}>
      <div className="signal-meter__bars" aria-hidden="true">
        {Array.from({ length: segments }).map((_, index) => (
          <span
            className={`signal-meter__bar ${index < filled ? "signal-meter__bar--on" : ""}`}
            key={index}
            style={{ "--meter-index": index } as CSSProperties}
          />
        ))}
      </div>
      <div className="signal-meter__meta">
        <span>ready mesh</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function MeshActivity({
  providers,
  providerHealth,
  experts,
}: {
  providers: Provider[];
  providerHealth: ProviderHealth[];
  experts: RaidStatus["experts"];
}) {
  const cells = Array.from({ length: 15 }, (_, index) => {
    const provider = providers[index];
    if (!provider) {
      return { key: `empty-${index}`, state: "empty" as const, label: "empty" };
    }

    const health = providerHealth.find((item) => item.providerId === provider.providerId);
    const expert = experts.find((item) => item.providerId === provider.providerId);

    let state: "active" | "ready" | "warm" | "down";
    if (expert && !["timed_out", "failed", "invalid"].includes(expert.status)) {
      state = "active";
    } else if (health?.ready) {
      state = "ready";
    } else if (health?.reachable || provider.status === "available") {
      state = "warm";
    } else {
      state = "down";
    }

    return {
      key: provider.providerId,
      state,
      label: provider.displayName,
    };
  });

  const rows = [cells.slice(0, 5), cells.slice(5, 10), cells.slice(10, 15)];

  return (
    <div className="mesh-panel">
      <div className="mesh-summary">
        <div>
          <span>armed</span>
          <strong>{cells.filter((cell) => cell.state === "active").length}</strong>
        </div>
        <div>
          <span>ready</span>
          <strong>{cells.filter((cell) => cell.state === "ready").length}</strong>
        </div>
        <div>
          <span>down</span>
          <strong>{cells.filter((cell) => cell.state === "down").length}</strong>
        </div>
      </div>
      <div className="mesh-board" aria-label="Provider mesh activity">
        {rows.map((row, rowIndex) => (
          <div className={`mesh-row ${rowIndex % 2 === 1 ? "mesh-row--offset" : ""}`} key={rowIndex}>
            {row.map((cell) => (
              <div className={`mesh-cell mesh-cell--${cell.state}`} key={cell.key}>
                <span>{cell.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
