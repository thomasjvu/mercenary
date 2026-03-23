import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DocsButton } from "@bossraid/ui";
import useSWR from "swr";
import { API_BASE, fetchJson, fetchRaidResult, fetchRaidStatus, type Provider, type RaidResult, type RaidStatus } from "../api";

type AppRoute = "/" | "/demo" | "/raiders" | "/receipt";

type ReceiptPageProps = {
  onNavigate: (path: AppRoute) => void;
};

type ReceiptQuery = {
  raidId: string;
  token: string;
};

type RoutingDecision = NonNullable<RaidResult["routingProof"]>["providers"][number];
type SubmissionArtifact = NonNullable<NonNullable<RaidResult["synthesizedOutput"]>["artifacts"]>[number];

const TERMINAL_STATUSES = new Set(["final", "cancelled", "expired"]);

export function ReceiptPage({ onNavigate }: ReceiptPageProps) {
  const initialQuery = useMemo(readReceiptQuery, []);
  const [raidIdInput, setRaidIdInput] = useState(initialQuery?.raidId ?? "");
  const [tokenInput, setTokenInput] = useState(initialQuery?.token ?? "");
  const [activeQuery, setActiveQuery] = useState<ReceiptQuery | null>(initialQuery);
  const [shareCopied, setShareCopied] = useState(false);

  const status = useSWR(
    activeQuery ? (["receipt-status", activeQuery.raidId, activeQuery.token] as const) : null,
    ([, raidId, token]) => fetchRaidStatus(raidId, token),
    {
      refreshInterval: (latestData?: RaidStatus) =>
        activeQuery && !TERMINAL_STATUSES.has(latestData?.status ?? "") ? 2_000 : 0,
      revalidateOnFocus: true,
    },
  );

  const statusIsTerminal = status.data ? TERMINAL_STATUSES.has(status.data.status) : false;
  const result = useSWR(
    activeQuery ? (["receipt-result", activeQuery.raidId, activeQuery.token] as const) : null,
    ([, raidId, token]) => fetchRaidResult(raidId, token),
    {
      refreshInterval: (latestData?: RaidResult) =>
        activeQuery && !statusIsTerminal && !TERMINAL_STATUSES.has(latestData?.status ?? "") ? 2_000 : 0,
      revalidateOnFocus: true,
    },
  );
  const providers = useSWR<Provider[]>(activeQuery ? "/v1/providers" : null, (path: string) => fetchJson(path), {
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (!shareCopied) {
      return;
    }

    const timer = window.setTimeout(() => setShareCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [shareCopied]);

  function handleLoadReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const raidId = raidIdInput.trim();
    const token = tokenInput.trim();
    if (!raidId || !token) {
      return;
    }

    const next = { raidId, token };
    setActiveQuery(next);
    window.history.replaceState({}, "", buildReceiptPath(next));
  }

  async function handleCopyLink() {
    if (!activeQuery) {
      return;
    }

    try {
      await navigator.clipboard.writeText(buildReceiptUrl(activeQuery));
      setShareCopied(true);
    } catch {
      setShareCopied(false);
    }
  }

  const approvedProviders = uniqueStrings(
    result.data?.settlementExecution?.successfulProviderIds.length
      ? result.data.settlementExecution.successfulProviderIds
      : result.data?.synthesizedOutput?.contributingProviderIds.length
        ? result.data.synthesizedOutput.contributingProviderIds
        : (result.data?.approvedSubmissions ?? []).map((submission) => submission.submission.providerId),
  );
  const supportingProviders = uniqueStrings(
    (result.data?.synthesizedOutput?.supportingProviderIds ?? []).filter((providerId) => !approvedProviders.includes(providerId)),
  );
  const droppedProviders = uniqueStrings(result.data?.synthesizedOutput?.droppedProviderIds ?? []);
  const workstreams = result.data?.synthesizedOutput?.workstreams ?? [];
  const synthesizedArtifacts = result.data?.synthesizedOutput?.artifacts ?? [];
  const settlementExecution = result.data?.settlementExecution;
  const reputationEvents = result.data?.reputationEvents ?? [];
  const routingProof = result.data?.routingProof;
  const routingDecisions = routingProof?.providers ?? [];
  const providerMap = new Map((providers.data ?? []).map((provider) => [provider.providerId, provider]));
  const routingDecisionMap = new Map<string, RoutingDecision[]>();

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
  const erc8004ProviderCount = countProvidersWithSignal(routingDecisionMap, (decision) => decision.erc8004Registered);
  const trustScoredProviderCount = countProvidersWithSignal(routingDecisionMap, (decision) => decision.trustScore > 0);
  const veniceProviderCount = countProvidersWithSignal(routingDecisionMap, (decision) => decision.veniceBacked);
  const veniceProviderNames = routedProviderIds
    .filter((providerId) => routingDecisionMap.get(providerId)?.some((decision) => decision.veniceBacked))
    .map((providerId) => providerMap.get(providerId)?.displayName ?? providerId);

  return (
    <section className="receipt-shell" id="receipt">
      <div className="receipt-shell__header">
        <div className="receipt-shell__copy">
          <p className="eyebrow">public receipt</p>
          <h1>
            <span className="directory-hero__headline-line">Open one raid receipt.</span>
            <span className="directory-hero__headline-line">Keep the proof surface shareable.</span>
          </h1>
          <p className="lede receipt-shell__lede">
            Use the `raidId` and `raidAccessToken` returned by `POST /v1/raid` or `bossraid_delegate`. The token is a
            capability link for this one raid only.
          </p>
        </div>

        <div className="directory-shell__actions">
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
          <DocsButton className="button button--primary" label="docs" />
        </div>
      </div>

      <form className="receipt-form" onSubmit={handleLoadReceipt}>
        <label className="receipt-field">
          <span>raid id</span>
          <input
            className="receipt-field__input"
            onChange={(event) => setRaidIdInput(event.target.value)}
            placeholder="raid_..."
            spellCheck={false}
            type="text"
            value={raidIdInput}
          />
        </label>
        <label className="receipt-field">
          <span>raid access token</span>
          <input
            className="receipt-field__input"
            onChange={(event) => setTokenInput(event.target.value)}
            placeholder="paste raidAccessToken"
            spellCheck={false}
            type="text"
            value={tokenInput}
          />
        </label>
        <div className="receipt-form__actions">
          <button className="button button--primary" type="submit">
            load receipt
          </button>
          <button className="button" disabled={!activeQuery} onClick={handleCopyLink} type="button">
            {shareCopied ? "copied" : "copy link"}
          </button>
        </div>
      </form>

      <div className="receipt-proof-note">
        <strong>How it works:</strong> this page reads the existing public raid status and result routes with the
        per-raid access token sent as `x-bossraid-raid-token`. Current reads come from Boss Raid's normal persisted
        state and settlement artifacts.
      </div>

      {!activeQuery ? (
        <article className="receipt-empty">
          <p className="eyebrow">capability link</p>
          <h2>Load a receipt with the per-raid access token.</h2>
          <p>Start a raid, keep the returned `raidId` and `raidAccessToken`, then open:</p>
          <pre className="code-panel receipt-empty__code">/receipt?raidId=&lt;raidId&gt;&amp;token=&lt;raidAccessToken&gt;</pre>
        </article>
      ) : null}

      {status.error || result.error ? (
        <article className="receipt-empty receipt-empty--error">
          <p className="eyebrow">load failed</p>
          <h2>Receipt access was rejected.</h2>
          <p>{status.error?.message ?? result.error?.message}</p>
        </article>
      ) : null}

      {activeQuery && !status.error && !result.error ? (
        <>
          <div className="directory-summary-bar">
            <SummaryPill label="raid" value={shortValue(activeQuery.raidId)} />
            <SummaryPill label="status" value={status.data?.status ?? "loading"} />
            <SummaryPill label="approved" value={String(approvedProviders.length)} />
            <SummaryPill
              label="8183"
              value={settlementExecution?.proofStandard === "erc8183_aligned" ? "active" : "pending"}
            />
            <SummaryPill label="8004" value={`${erc8004ProviderCount}/${routedProviderIds.length || 0}`} />
            <SummaryPill label="venice" value={String(veniceProviderCount)} />
          </div>

          <div className="proof-grid proof-grid--compact">
            <ProofCard
              label="erc-8183 settlement"
              title={settlementExecution?.proofStandard === "erc8183_aligned" ? "child-job settlement live" : "settlement proof pending"}
              copy={
                settlementExecution?.childJobs.length
                  ? `${settlementExecution.childJobs.length} child jobs linked to the parent raid receipt.`
                  : "No child-job linkage has been recorded on this receipt yet."
              }
            />
            <ProofCard
              label="erc-8004 routing"
              title={`${erc8004ProviderCount}/${routedProviderIds.length || 0} routed providers registered`}
              copy={
                routingProof?.policy.requireErc8004
                  ? "ERC-8004 registration was required in this routing policy."
                  : trustScoredProviderCount
                    ? `${trustScoredProviderCount} routed providers carry trust scores.`
                    : "No routed provider trust score has been exposed yet."
              }
            />
            <ProofCard
              label="venice private lane"
              title={
                routingProof?.policy.venicePrivateLane
                  ? veniceProviderCount
                    ? `${veniceProviderCount} venice-backed providers recorded`
                    : "venice lane requested but not satisfied"
                  : veniceProviderCount
                    ? `${veniceProviderCount} venice-backed providers recorded`
                    : "no venice-backed provider recorded"
              }
              copy={
                veniceProviderNames.length
                  ? veniceProviderNames.join(" / ")
                  : "Use strict privacy mode with Venice-backed providers so the private lane is explicit."
              }
            />
            <ProofCard
              label="manifest + log"
              title="public manifest and token-gated raid log"
              copy="Judges should be able to open Mercenary's manifest and this raid's execution log without internal ops access."
            />
            <ProofCard
              label="attested result"
              title="header-gated attestation route"
              copy="Use the raid token with the attested-result route to prove the final output under the public receipt."
            />
          </div>

          <section className="receipt-layout">
            <div className="receipt-column">
              <article className="receipt-panel">
                <div className="receipt-panel__head">
                  <div>
                    <p className="eyebrow">canonical output</p>
                    <h2>Mixture-of-experts result</h2>
                  </div>
                </div>
                <div className="receipt-panel__body">
                  {result.data?.synthesizedOutput?.answerText ? (
                    <p className="receipt-panel__text">{result.data.synthesizedOutput.answerText}</p>
                  ) : result.data?.synthesizedOutput?.explanation ? (
                    <p className="receipt-panel__text">{result.data.synthesizedOutput.explanation}</p>
                  ) : result.data?.primarySubmission?.submission.answerText ? (
                    <p className="receipt-panel__text">{result.data.primarySubmission.submission.answerText}</p>
                  ) : result.data?.primarySubmission?.submission.explanation ? (
                    <p className="receipt-panel__text">{result.data.primarySubmission.submission.explanation}</p>
                  ) : (
                    <p className="receipt-panel__muted">No approved output yet.</p>
                  )}

                  {result.data?.synthesizedOutput?.patchUnifiedDiff ? (
                    <pre className="code-panel receipt-panel__diff">{result.data.synthesizedOutput.patchUnifiedDiff}</pre>
                  ) : result.data?.primarySubmission?.submission.patchUnifiedDiff ? (
                    <pre className="code-panel receipt-panel__diff">{result.data.primarySubmission.submission.patchUnifiedDiff}</pre>
                  ) : null}

                  {synthesizedArtifacts.length ? <ArtifactGallery artifacts={synthesizedArtifacts} /> : null}
                </div>
              </article>

              <article className="receipt-panel">
                <div className="receipt-panel__head">
                  <div>
                    <p className="eyebrow">workstreams</p>
                    <h2>Scoped specialist routing</h2>
                  </div>
                </div>
                <div className="receipt-card-grid">
                  {workstreams.length ? (
                    workstreams.map((workstream) => (
                      <article className="receipt-card" key={workstream.id}>
                        <span>workstream</span>
                        <strong>{workstream.label}</strong>
                        <p>{workstream.summary}</p>
                        {workstream.artifacts?.length ? <ArtifactGallery artifacts={workstream.artifacts} compact /> : null}
                        <small>{workstream.roleLabels.join(" / ") || workstream.objective}</small>
                      </article>
                    ))
                  ) : (
                    <p className="receipt-panel__muted">No synthesized workstreams yet.</p>
                  )}
                </div>
              </article>
            </div>

            <div className="receipt-column">
              <article className="receipt-panel">
                <div className="receipt-panel__head">
                  <div>
                    <p className="eyebrow">artifacts</p>
                    <h2>Judge-visible proof links</h2>
                  </div>
                </div>
                <div className="proof-link-list">
                  <ProofLinkRow href={buildAgentManifestUrl()} label="manifest" note="public Mercenary manifest" value="GET /v1/agent.json" />
                  {activeQuery ? (
                    <ProofLinkRow
                      href={buildAgentLogUrl(activeQuery)}
                      label="agent log"
                      note="token-gated execution log for this raid"
                      value={`GET /v1/raids/${activeQuery.raidId}/agent_log.json?token=...`}
                    />
                  ) : null}
                  {activeQuery ? (
                    <ProofLinkRow
                      label="attested result"
                      note="send x-bossraid-raid-token to this route"
                      value={`GET /v1/raid/${activeQuery.raidId}/attested-result`}
                    />
                  ) : null}
                </div>
              </article>

              <article className="receipt-panel">
                <div className="receipt-panel__head">
                  <div>
                    <p className="eyebrow">routing policy</p>
                    <h2>Venice lane and intake guardrails</h2>
                  </div>
                </div>
                <div className="receipt-card-grid receipt-card-grid--compact">
                  <ReceiptMetricCard label="privacy mode" value={routingProof?.policy.privacyMode ?? "pending"} />
                  <ReceiptMetricCard label="selection" value={routingProof?.policy.selectionMode ?? "pending"} />
                  <ReceiptMetricCard
                    label="venice lane"
                    value={routingProof?.policy.venicePrivateLane ? "active" : "off"}
                  />
                  <ReceiptMetricCard
                    label="8004 required"
                    value={routingProof?.policy.requireErc8004 ? "yes" : "no"}
                  />
                  <ReceiptMetricCard
                    label="min trust"
                    value={routingProof?.policy.minTrustScore == null ? "none" : String(routingProof.policy.minTrustScore)}
                  />
                  <ReceiptMetricCard label="venice routed" value={String(veniceProviderCount)} />
                  <ReceiptMetricCard label="8004 routed" value={String(erc8004ProviderCount)} />
                  <ReceiptMetricCard label="trust scored" value={String(trustScoredProviderCount)} />
                  <ReceiptMetricCard label="risk tier" value={status.data?.sanitization.riskTier ?? "pending"} />
                  <ReceiptMetricCard label="redacted secrets" value={String(status.data?.sanitization.redactedSecrets ?? 0)} />
                  <ReceiptMetricCard
                    label="redacted identifiers"
                    value={String(status.data?.sanitization.redactedIdentifiers ?? 0)}
                  />
                  <ReceiptMetricCard label="trimmed files" value={String(status.data?.sanitization.trimmedFiles ?? 0)} />
                </div>
                <div className="receipt-proof-note">
                  <strong>Private vs public:</strong> strict mode keeps sensitive task context inside Venice-backed provider
                  paths. The public receipt shows only routing policy, trust and privacy signals, settlement records, and
                  attested output metadata.
                </div>
              </article>

              <article className="receipt-panel">
                <div className="receipt-panel__head">
                  <div>
                    <p className="eyebrow">contributors</p>
                    <h2>Routing outcomes</h2>
                  </div>
                </div>
                <div className="receipt-list">
                  <div className="receipt-list__section">
                    <strong>approved</strong>
                    {result.data?.approvedSubmissions?.length ? (
                      result.data.approvedSubmissions.map((entry) => {
                        const roleLabel = entry.submission.contributionRole?.label;
                        const workstreamLabel = entry.submission.contributionRole?.workstreamLabel;
                        const contributionLabel =
                          workstreamLabel && roleLabel
                            ? `${workstreamLabel} / ${roleLabel}`
                            : workstreamLabel ?? roleLabel ?? "approved";
                        const routingDecision = matchRoutingDecision(
                          routingDecisionMap.get(entry.submission.providerId),
                          workstreamLabel,
                          roleLabel,
                        );
                        const providerProof = buildProviderProofNote(
                          routingDecision,
                          providerMap.get(entry.submission.providerId),
                        );
                        const routingReason = buildRoutingReasonNote(routingDecision);

                        return (
                          <div className="receipt-list__row" key={`${entry.submission.providerId}-${entry.rank}`}>
                            <span>{entry.submission.providerId}</span>
                            <span>
                              {contributionLabel} · score {formatScore(entry.breakdown.finalScore)}
                              {providerProof ? ` · ${providerProof}` : ""}
                              {routingReason ? ` · why ${routingReason}` : ""}
                            </span>
                          </div>
                        );
                      })
                    ) : approvedProviders.length ? (
                      approvedProviders.map((providerId) => {
                        const routingDecision = matchRoutingDecision(routingDecisionMap.get(providerId));
                        const providerProof = buildProviderProofNote(routingDecision, providerMap.get(providerId));
                        const routingReason = buildRoutingReasonNote(routingDecision);

                        return (
                          <div className="receipt-list__row" key={`approved-${providerId}`}>
                            <span>{providerId}</span>
                            <span>
                              approved contributor
                              {providerProof ? ` · ${providerProof}` : ""}
                              {routingReason ? ` · why ${routingReason}` : ""}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="receipt-panel__muted">No approved contributors yet.</p>
                    )}
                  </div>

                  <div className="receipt-list__section">
                    <strong>supporting</strong>
                    {supportingProviders.length ? (
                      supportingProviders.map((providerId) => {
                        const routingDecision = matchRoutingDecision(routingDecisionMap.get(providerId));
                        const providerProof = buildProviderProofNote(routingDecision, providerMap.get(providerId));
                        const routingReason = buildRoutingReasonNote(routingDecision);

                        return (
                          <div className="receipt-list__row" key={`supporting-${providerId}`}>
                            <span>{providerId}</span>
                            <span>
                              supporting evidence only
                              {providerProof ? ` · ${providerProof}` : ""}
                              {routingReason ? ` · why ${routingReason}` : ""}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="receipt-panel__muted">No supporting-only providers recorded.</p>
                    )}
                  </div>

                  <div className="receipt-list__section">
                    <strong>dropped</strong>
                    {droppedProviders.length ? (
                      droppedProviders.map((providerId) => {
                        const routingDecision = matchRoutingDecision(routingDecisionMap.get(providerId));
                        const providerProof = buildProviderProofNote(routingDecision, providerMap.get(providerId));
                        const routingReason = buildRoutingReasonNote(routingDecision);

                        return (
                          <div className="receipt-list__row" key={`dropped-${providerId}`}>
                            <span>{providerId}</span>
                            <span>
                              dropped from the canonical result
                              {providerProof ? ` · ${providerProof}` : ""}
                              {routingReason ? ` · why ${routingReason}` : ""}
                            </span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="receipt-panel__muted">No dropped providers recorded.</p>
                    )}
                  </div>
                </div>
              </article>

              <article className="receipt-panel">
                <div className="receipt-panel__head">
                  <div>
                    <p className="eyebrow">settlement</p>
                    <h2>Proof and payout</h2>
                  </div>
                </div>
                <div className="receipt-card-grid receipt-card-grid--compact">
                  <ReceiptMetricCard label="proof" value={settlementExecution?.proofStandard ?? "pending"} />
                  <ReceiptMetricCard label="registry" value={settlementExecution?.registryRaidRef ?? "pending"} />
                  <ReceiptMetricCard label="task hash" value={shortValue(settlementExecution?.taskHash ?? "pending")} />
                  <ReceiptMetricCard
                    label="evaluation hash"
                    value={shortValue(settlementExecution?.evaluationHash ?? "pending")}
                  />
                  <ReceiptMetricCard
                    label="registry contract"
                    value={shortValue(settlementExecution?.contracts.registryAddress ?? "pending")}
                  />
                  <ReceiptMetricCard
                    label="escrow contract"
                    value={shortValue(settlementExecution?.contracts.escrowAddress ?? "pending")}
                  />
                  <ReceiptMetricCard label="split" value={formatUsd(result.data?.settlement?.payoutPerSuccessfulProvider)} />
                </div>

                <div className="receipt-list">
                  <div className="receipt-list__section">
                    <strong>allocations</strong>
                    {settlementExecution?.allocations.length ? (
                      settlementExecution.allocations.map((allocation) => (
                        <div className="receipt-list__row" key={`${allocation.providerId}-${allocation.role}`}>
                          <span>{allocation.providerId}</span>
                          <span>
                            {allocation.role} · {allocation.status} · {formatUsd(allocation.totalAmount)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="receipt-panel__muted">No settlement allocation yet.</p>
                    )}
                  </div>

                  <div className="receipt-list__section">
                    <strong>transactions</strong>
                    {settlementExecution?.transactionHashes?.length ? (
                      settlementExecution.transactionHashes.map((hash) => (
                        <div className="receipt-list__row receipt-list__row--hash" key={hash}>
                          <span>tx</span>
                          <span>{hash}</span>
                        </div>
                      ))
                    ) : (
                      <p className="receipt-panel__muted">No onchain transaction yet.</p>
                    )}
                  </div>

                  <div className="receipt-list__section">
                    <strong>child jobs</strong>
                    {settlementExecution?.childJobs.length ? (
                      settlementExecution.childJobs.map((job) => (
                        <div className="receipt-list__row" key={job.jobRef}>
                          <span>{job.providerId}</span>
                          <span>
                            {job.role} · {job.status} · {job.jobId ?? job.syntheticJobId ?? "pending"}
                            {job.createTxHash ? ` · ${shortValue(job.createTxHash)}` : ""}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="receipt-panel__muted">No child-job proof yet.</p>
                    )}
                  </div>

                  <div className="receipt-list__section">
                    <strong>reputation events</strong>
                    {reputationEvents.length ? (
                      reputationEvents.map((event) => (
                        <div className="receipt-list__row" key={`${event.providerId}-${event.type}-${event.timestamp}`}>
                          <span>{event.providerId}</span>
                          <span>
                            {event.type} · {formatTimestamp(event.timestamp)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="receipt-panel__muted">No reputation events recorded yet.</p>
                    )}
                  </div>
                </div>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}

function ProofCard({ label, title, copy }: { label: string; title: string; copy: string }) {
  return (
    <article className="proof-card proof-card--compact">
      <span>{label}</span>
      <strong>{title}</strong>
      <p>{copy}</p>
    </article>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <article className="summary-pill">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ProofLinkRow({
  href,
  label,
  note,
  value,
}: {
  href?: string;
  label: string;
  note: string;
  value: string;
}) {
  return (
    <div className="proof-link-row">
      <span>{label}</span>
      <strong>{href ? <a href={href}>{value}</a> : value}</strong>
      <p>{note}</p>
    </div>
  );
}

function ReceiptMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="receipt-card receipt-card--metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
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

function shortValue(value: string): string {
  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 8)}…${value.slice(-8)}`;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim().length > 0))];
}

function ArtifactGallery({
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
        gap: "0.9rem",
        gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
        marginTop: "1rem",
      }}
    >
      {visibleArtifacts.map((artifact) => (
        <ArtifactCard artifact={artifact} compact={compact} key={`${artifact.outputType}-${artifact.uri}`} />
      ))}
      {artifacts.length > visibleArtifacts.length ? (
        <p className="receipt-panel__muted">+{artifacts.length - visibleArtifacts.length} more artifact refs</p>
      ) : null}
    </div>
  );
}

function ArtifactCard({
  artifact,
  compact,
}: {
  artifact: SubmissionArtifact;
  compact: boolean;
}) {
  const isImage = isRenderableImageArtifact(artifact);
  const isVideo = isRenderableVideoArtifact(artifact);

  return (
    <article
      className="receipt-card"
      style={{
        overflow: "hidden",
        gap: "0.75rem",
      }}
    >
      {isImage ? (
        <img
          alt={artifact.label}
          loading="lazy"
          src={artifact.uri}
          style={{
            width: "100%",
            maxHeight: compact ? "140px" : "220px",
            objectFit: "cover",
            borderRadius: "0.9rem",
          }}
        />
      ) : null}
      {isVideo ? (
        <video
          controls
          preload="metadata"
          src={artifact.uri}
          style={{
            width: "100%",
            maxHeight: compact ? "160px" : "240px",
            borderRadius: "0.9rem",
          }}
        />
      ) : null}
      <div>
        <span>{artifactKindLabel(artifact)}</span>
        <strong>{artifact.label}</strong>
        {!compact && artifact.description ? <p>{artifact.description}</p> : null}
        <small>
          <a href={artifact.uri} rel="noreferrer" target="_blank">
            {compact ? "open artifact" : shortValue(artifact.uri)}
          </a>
          {artifact.sha256 ? ` · sha ${shortValue(artifact.sha256)}` : ""}
        </small>
      </div>
    </article>
  );
}

function artifactKindLabel(artifact: SubmissionArtifact): string {
  return artifact.mimeType ? `${artifact.outputType} · ${artifact.mimeType}` : artifact.outputType;
}

function isRenderableImageArtifact(artifact: SubmissionArtifact): boolean {
  return artifact.outputType === "image" || (artifact.mimeType?.startsWith("image/") ?? false);
}

function isRenderableVideoArtifact(artifact: SubmissionArtifact): boolean {
  return artifact.outputType === "video" || (artifact.mimeType?.startsWith("video/") ?? false);
}

function hasErc8004Registration(provider: Provider): boolean {
  return typeof provider.erc8004?.registrationTx === "string" && provider.erc8004.registrationTx.length > 0;
}

function isVeniceProvider(provider: Provider): boolean {
  return (provider.modelFamily ?? "").toLowerCase().includes("venice");
}

function countProvidersWithSignal(
  routingDecisionMap: Map<string, RoutingDecision[]>,
  predicate: (decision: RoutingDecision) => boolean,
): number {
  let count = 0;

  for (const decisions of routingDecisionMap.values()) {
    if (decisions.some(predicate)) {
      count += 1;
    }
  }

  return count;
}

function matchRoutingDecision(
  decisions: RoutingDecision[] | undefined,
  workstreamLabel?: string,
  roleLabel?: string,
): RoutingDecision | undefined {
  if (!decisions?.length) {
    return undefined;
  }

  if (workstreamLabel || roleLabel) {
    const exactMatch = decisions.find(
      (decision) =>
        (workstreamLabel == null || decision.workstreamLabel === workstreamLabel) &&
        (roleLabel == null || decision.roleLabel === roleLabel),
    );
    if (exactMatch) {
      return exactMatch;
    }
  }

  return decisions.find((decision) => decision.phase === "primary") ?? decisions[0];
}

function buildProviderProofNote(decision: RoutingDecision | undefined, provider: Provider | undefined): string {
  const privacyFeatures = new Set<string>(decision?.privacyFeatures ?? []);
  if (provider?.privacy?.noDataRetention) {
    privacyFeatures.add("no_data_retention");
  }
  if (provider?.privacy?.signedOutputs) {
    privacyFeatures.add("signed_outputs");
  }
  if (provider?.privacy?.teeAttested) {
    privacyFeatures.add("tee_attested");
  }

  const trustScore =
    decision?.trustScore ??
    (typeof provider?.trust?.score === "number" ? provider.trust.score : undefined);
  const registrationTx = decision?.registrationTx ?? provider?.erc8004?.registrationTx;
  const parts = [
    decision?.erc8004Registered ?? (provider ? hasErc8004Registration(provider) : false) ? "8004 registered" : "8004 pending",
    registrationTx ? `reg ${shortValue(registrationTx)}` : null,
    typeof trustScore === "number" && trustScore > 0 ? `trust ${trustScore}` : null,
    decision?.veniceBacked ?? (provider ? isVeniceProvider(provider) : false) ? "venice" : null,
    privacyFeatures.has("no_data_retention") ? "no-retention" : null,
    privacyFeatures.has("signed_outputs") ? "signed outputs" : null,
    privacyFeatures.has("tee_attested") ? "tee" : null,
  ].filter((value): value is string => value != null);

  return parts.join(" · ");
}

function buildRoutingReasonNote(decision: RoutingDecision | undefined): string {
  if (!decision) {
    return "";
  }

  const reasonLabels = decision.reasons
    .filter((reason) => !["selected_primary", "reserved_fallback", "workstream_scoped"].includes(reason))
    .map((reason) => {
      switch (reason) {
        case "strict_privacy":
          return "strict privacy";
        case "privacy_requested":
          return "privacy preferred";
        case "venice_private_lane":
          return "venice lane";
        case "venice_fallback":
          return "venice fallback";
        case "allowed_model_family":
          return "model family match";
        case "required_privacy_features":
          return "privacy features";
        case "erc8004_required":
          return "erc-8004 required";
        case "trust_threshold_met":
          return "trust threshold";
        case "trust_ranked":
          return "trust-ranked";
        case "specialization_match":
          return "specialist match";
        case "promoted_from_reserve":
          return "reserve promotion";
        default:
          return reason.replaceAll("_", " ");
      }
    });

  return reasonLabels.join(" / ");
}

function buildAgentManifestUrl(): string {
  return `${API_BASE}/v1/agent.json`;
}

function buildAgentLogUrl(query: ReceiptQuery): string {
  return `${API_BASE}/v1/raids/${encodeURIComponent(query.raidId)}/agent_log.json?token=${encodeURIComponent(query.token)}`;
}

function buildReceiptUrl(query: ReceiptQuery): string {
  return new URL(buildReceiptPath(query), window.location.origin).toString();
}

function buildReceiptPath(query: ReceiptQuery): string {
  const params = new URLSearchParams({
    raidId: query.raidId,
    token: query.token,
  });
  return `/receipt?${params.toString()}`;
}

function readReceiptQuery(): ReceiptQuery | null {
  if (typeof window === "undefined") {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const raidId = params.get("raidId") ?? params.get("raid_id") ?? "";
  const token = params.get("token") ?? params.get("raidAccessToken") ?? params.get("raid_access_token") ?? "";

  if (!raidId || !token) {
    return null;
  }

  return { raidId, token };
}
