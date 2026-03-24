import { useEffect, useMemo, useState, type FormEvent } from "react";
import { DocsButton } from "@bossraid/ui";
import useSWR from "swr";
import {
  API_BASE,
  fetchAttestedRaidResult,
  fetchAttestedRuntime,
  fetchJson,
  fetchRaidResult,
  fetchRaidStatus,
  type AttestedEnvelope,
  type AttestedRaidResultPayload,
  type AttestedRuntimePayload,
  type Provider,
  type RaidResult,
  type RaidStatus,
} from "../api";

type AppRoute = "/" | "/demo" | "/raiders" | "/receipt";

type ReceiptPageProps = {
  onNavigate: (path: AppRoute) => void;
};

type ReceiptQuery = {
  raidId: string;
  token: string;
};

type RoutingDecision = NonNullable<RaidResult["routingProof"]>["providers"][number];
type SettlementExecution = NonNullable<RaidResult["settlementExecution"]>;
type SettlementChildJob = SettlementExecution["childJobs"][number];
type SubmissionArtifact = NonNullable<NonNullable<RaidResult["synthesizedOutput"]>["artifacts"]>[number];
type Erc8004VerificationStatus = NonNullable<NonNullable<Provider["erc8004"]>["verification"]>["status"];

const TERMINAL_STATUSES = new Set(["final", "cancelled", "expired"]);
const PINNED_PROOF_RECEIPT_URL =
  (import.meta.env.VITE_BOSSRAID_PROOF_RECEIPT_URL as string | undefined)?.trim() ?? "";

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
  const attestedRuntime = useSWR<AttestedEnvelope<AttestedRuntimePayload>>(
    "receipt-attested-runtime",
    () => fetchAttestedRuntime(),
    {
      revalidateOnFocus: false,
    },
  );
  const attestedResult = useSWR<AttestedEnvelope<AttestedRaidResultPayload>>(
    activeQuery ? (["receipt-attested-result", activeQuery.raidId, activeQuery.token] as const) : null,
    ([, raidId, token]: readonly [string, string, string]) => fetchAttestedRaidResult(raidId, token),
    {
      refreshInterval: () => (activeQuery && !statusIsTerminal ? 2_000 : 0),
      revalidateOnFocus: true,
    },
  );

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
  const verifiedErc8004ProviderCount = countProvidersWithSignal(
    routingDecisionMap,
    (decision) => decision.erc8004VerificationStatus === "verified",
  );
  const partialErc8004ProviderCount = countProvidersWithSignal(
    routingDecisionMap,
    (decision) => decision.erc8004VerificationStatus === "partial",
  );
  const trustScoredProviderCount = countProvidersWithSignal(routingDecisionMap, (decision) => decision.trustScore > 0);
  const veniceProviderCount = countProvidersWithSignal(routingDecisionMap, (decision) => decision.veniceBacked);
  const veniceProviderNames = routedProviderIds
    .filter((providerId) => routingDecisionMap.get(providerId)?.some((decision) => decision.veniceBacked))
    .map((providerId) => providerMap.get(providerId)?.displayName ?? providerId);
  const runtimeAttestationStatus = attestedRuntime.data ? "live" : attestedRuntime.error ? "unavailable" : "loading";
  const resultAttestationStatus = attestedResult.data ? "live" : attestedResult.error ? "unavailable" : activeQuery ? "loading" : "pending";
  const attestationTarget = attestedResult.data?.payload.deploymentTarget ?? attestedRuntime.data?.payload.deploymentTarget ?? "pending";
  const attestationTee = attestedResult.data?.payload.teePlatform ?? attestedRuntime.data?.payload.teePlatform ?? "pending";
  const attestationCardTitle = attestedResult.data
    ? "runtime + result proof loaded"
    : attestedRuntime.data
      ? "runtime proof loaded"
      : attestedRuntime.error
        ? "attestation unavailable"
        : "attestation pending";
  const attestationCardCopy =
    attestedRuntime.data || attestedResult.data
      ? `${attestationTarget} / ${attestationTee}`
      : "Load a receipt to fetch the public runtime proof and the token-gated attested result.";

  return (
    <section className="receipt-shell" id="receipt">
      <div className="receipt-shell__header">
        <div className="receipt-shell__copy">
          <p className="eyebrow">shareable receipt</p>
          <h1>
            <span className="directory-hero__headline-line">Open one raid receipt.</span>
            <span className="directory-hero__headline-line">Keep the proof surface shareable.</span>
          </h1>
          <p className="lede receipt-shell__lede">
            This route reads the same persisted proof that <code>/demo</code> shows inline, but packages it as one
            capability URL you can hand to someone else. Use the `raidId` and `raidAccessToken` returned by
            `POST /v1/raid` or `bossraid_delegate`.
          </p>
        </div>

        <div className="directory-shell__actions">
          <a
            className="button"
            href="/demo"
            onClick={(event) => {
              event.preventDefault();
              onNavigate("/demo");
            }}
          >
            demo
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
        <strong>How it works:</strong> this route does not rerun the raid. It reads the existing status and result with
        the per-raid access token sent as `x-bossraid-raid-token`, then renders the same persisted proof and settlement
        artifacts that the app can already show inline.
      </div>

      {!activeQuery ? (
        <article className="receipt-empty">
          <p className="eyebrow">capability link</p>
          <h2>Load a receipt with the per-raid access token.</h2>
          <p>Start a raid, keep the returned `raidId` and `raidAccessToken`, then open:</p>
          <pre className="code-panel receipt-empty__code">/receipt?raidId=&lt;raidId&gt;&amp;token=&lt;raidAccessToken&gt;</pre>
          <div className="demo-sidebar__actions">
            {PINNED_PROOF_RECEIPT_URL ? (
              <a className="button button--primary" href={PINNED_PROOF_RECEIPT_URL}>
                open pinned live receipt
              </a>
            ) : null}
            <a
              className="button"
              href="/demo"
              onClick={(event) => {
                event.preventDefault();
                onNavigate("/demo");
              }}
            >
              open live demo
            </a>
            <a className="button" href={buildAttestedRuntimeUrl()} rel="noreferrer" target="_blank">
              open attested runtime
            </a>
          </div>
          <p>
            {PINNED_PROOF_RECEIPT_URL
              ? "Use the pinned live receipt for a no-wallet proof path, or open /demo to launch a new hosted raid and share its proof."
              : "Set VITE_BOSSRAID_PROOF_RECEIPT_URL to pin one recent live receipt for judges, then use /demo to launch a new hosted raid and share its proof."}
          </p>
          <p>
            {attestedRuntime.data
              ? `Runtime proof live on ${attestedRuntime.data.payload.deploymentTarget ?? "unknown"} / ${attestedRuntime.data.payload.teePlatform ?? "unknown"}.`
              : attestedRuntime.error
                ? readQueryErrorMessage(attestedRuntime.error)
                : "Loading runtime attestation."}
          </p>
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
            <SummaryPill label="8183" value={buildSettlementLifecycleLabel(settlementExecution?.lifecycleStatus)} />
            <SummaryPill label="8004 verified" value={String(verifiedErc8004ProviderCount)} />
            <SummaryPill label="venice" value={String(veniceProviderCount)} />
          </div>

          <div className="proof-grid proof-grid--compact">
            <ProofCard
              label="erc-8183 settlement"
              title={buildSettlementProofTitle(settlementExecution)}
              copy={buildSettlementProofCopy(settlementExecution)}
            />
            <ProofCard
              label="erc-8004 routing"
              title={
                erc8004ProviderCount > 0
                  ? `${verifiedErc8004ProviderCount}/${erc8004ProviderCount} registered providers verified`
                  : `${erc8004ProviderCount}/${routedProviderIds.length || 0} routed providers registered`
              }
              copy={
                routingProof?.policy.requireErc8004
                  ? partialErc8004ProviderCount > 0
                    ? `${partialErc8004ProviderCount} routed providers only partially verified against chain data.`
                    : "ERC-8004 registration was required in this routing policy."
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
              label="eigencompute attestation"
              title={attestationCardTitle}
              copy={attestationCardCopy}
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
                  <ProofLinkRow
                    href={buildAttestedRuntimeUrl()}
                    label="attested runtime"
                    note="public signed runtime proof for the active deployment"
                    value="GET /v1/attested-runtime"
                  />
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
                      note={
                        attestedResult.data
                          ? `loaded below · hash ${shortValue(attestedResult.data.messageHash)}`
                          : "fetched below with x-bossraid-raid-token"
                      }
                      value={`GET /v1/raid/${activeQuery.raidId}/attested-result`}
                    />
                  ) : null}
                </div>
              </article>

              <article className="receipt-panel">
                <div className="receipt-panel__head">
                  <div>
                    <p className="eyebrow">attestation</p>
                    <h2>EigenCompute proof</h2>
                  </div>
                </div>
                <div className="receipt-card-grid receipt-card-grid--compact">
                  <ReceiptMetricCard label="runtime proof" value={runtimeAttestationStatus} />
                  <ReceiptMetricCard label="result proof" value={resultAttestationStatus} />
                  <ReceiptMetricCard label="target" value={attestationTarget} />
                  <ReceiptMetricCard label="tee" value={attestationTee} />
                  <ReceiptMetricCard label="runtime signer" value={shortValue(attestedRuntime.data?.signer ?? "pending")} />
                  <ReceiptMetricCard label="result hash" value={shortValue(attestedResult.data?.payload.resultHash ?? "pending")} />
                </div>

                <div className="receipt-list">
                  <div className="receipt-list__section">
                    <strong>runtime proof</strong>
                    {attestedRuntime.data ? (
                      <>
                        <div className="receipt-list__row">
                          <span>signer</span>
                          <span>{attestedRuntime.data.signer}</span>
                        </div>
                        <div className="receipt-list__row receipt-list__row--hash">
                          <span>message hash</span>
                          <span>{attestedRuntime.data.messageHash}</span>
                        </div>
                        <div className="receipt-list__row receipt-list__row--hash">
                          <span>signature</span>
                          <span>{attestedRuntime.data.signature}</span>
                        </div>
                        <div className="receipt-list__row">
                          <span>timestamp</span>
                          <span>{formatTimestamp(attestedRuntime.data.payload.timestamp)}</span>
                        </div>
                      </>
                    ) : attestedRuntime.error ? (
                      <p className="receipt-panel__muted">{readQueryErrorMessage(attestedRuntime.error)}</p>
                    ) : (
                      <p className="receipt-panel__muted">Loading runtime attestation.</p>
                    )}
                  </div>

                  <div className="receipt-list__section">
                    <strong>result proof</strong>
                    {attestedResult.data ? (
                      <>
                        <div className="receipt-list__row">
                          <span>signer</span>
                          <span>{attestedResult.data.signer}</span>
                        </div>
                        <div className="receipt-list__row">
                          <span>status</span>
                          <span>{attestedResult.data.payload.status}</span>
                        </div>
                        <div className="receipt-list__row">
                          <span>approved</span>
                          <span>{String(attestedResult.data.payload.approvedSubmissionCount)}</span>
                        </div>
                        <div className="receipt-list__row receipt-list__row--hash">
                          <span>result hash</span>
                          <span>{attestedResult.data.payload.resultHash}</span>
                        </div>
                        <div className="receipt-list__row receipt-list__row--hash">
                          <span>message hash</span>
                          <span>{attestedResult.data.messageHash}</span>
                        </div>
                      </>
                    ) : attestedResult.error ? (
                      <p className="receipt-panel__muted">{readQueryErrorMessage(attestedResult.error)}</p>
                    ) : (
                      <p className="receipt-panel__muted">Loading attested raid result.</p>
                    )}
                  </div>
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
                  <ReceiptMetricCard label="8004 registered" value={String(erc8004ProviderCount)} />
                  <ReceiptMetricCard label="8004 verified" value={String(verifiedErc8004ProviderCount)} />
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
                  <ReceiptMetricCard label="mode" value={settlementExecution?.mode ?? "pending"} />
                  <ReceiptMetricCard
                    label="lifecycle"
                    value={buildSettlementLifecycleLabel(settlementExecution?.lifecycleStatus)}
                  />
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
                  <ReceiptMetricCard
                    label="finalize tx"
                    value={shortValue(settlementExecution?.finalizeTxHash ?? "pending")}
                  />
                  <ReceiptMetricCard label="split" value={formatUsd(result.data?.settlement?.payoutPerSuccessfulProvider)} />
                </div>
                <div className="receipt-proof-note">
                  <strong>Payout rule:</strong> Successful raiders split payout equally.
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
                    <strong>warnings</strong>
                    {settlementExecution?.warnings?.length ? (
                      settlementExecution.warnings.map((warning) => (
                        <div className="receipt-list__row" key={warning}>
                          <span>warn</span>
                          <span>{warning}</span>
                        </div>
                      ))
                    ) : (
                      <p className="receipt-panel__muted">No settlement warnings recorded.</p>
                    )}
                  </div>

                  <div className="receipt-list__section">
                    <strong>child jobs</strong>
                    {settlementExecution?.childJobs.length ? (
                      settlementExecution.childJobs.map((job) => (
                        <div className="receipt-list__row" key={job.jobRef}>
                          <span>{job.providerId}</span>
                          <span>{buildChildJobReceiptSummary(job)}</span>
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

function buildSettlementLifecycleLabel(lifecycleStatus: SettlementExecution["lifecycleStatus"] | undefined): string {
  switch (lifecycleStatus) {
    case "terminal":
      return "terminal";
    case "partial":
      return "partial";
    case "synthetic":
      return "synthetic";
    default:
      return "pending";
  }
}

function buildSettlementProofTitle(settlementExecution: SettlementExecution | undefined): string {
  if (!settlementExecution) {
    return "settlement proof pending";
  }

  switch (settlementExecution.lifecycleStatus) {
    case "terminal":
      return "terminal child-job settlement";
    case "partial":
      return "partial child-job settlement";
    case "synthetic":
      return "synthetic settlement record";
    default:
      return "child-job settlement live";
  }
}

function buildSettlementProofCopy(settlementExecution: SettlementExecution | undefined): string {
  if (!settlementExecution) {
    return "No child-job linkage has been recorded on this receipt yet.";
  }

  const notes = [`${settlementExecution.childJobs.length} child jobs linked to the parent raid receipt.`];
  if (settlementExecution.lifecycleStatus === "terminal") {
    notes.push("Recorded jobs reached terminal chain states.");
  } else if (settlementExecution.lifecycleStatus === "partial") {
    notes.push("More onchain job actions are still pending.");
  } else if (settlementExecution.lifecycleStatus === "synthetic") {
    notes.push("This receipt is still backed by the file settlement path.");
  }
  if (settlementExecution.warnings?.length) {
    notes.push(`${settlementExecution.warnings.length} operator warnings remain open.`);
  }

  return notes.join(" ");
}

function buildErc8004ProofLabel(
  verificationStatus: Erc8004VerificationStatus | undefined,
  registered: boolean,
): string {
  switch (verificationStatus) {
    case "verified":
      return "8004 verified";
    case "partial":
      return "8004 partial";
    case "failed":
      return "8004 failed";
    case "error":
      return "8004 error";
    default:
      return registered ? "8004 registered" : "8004 pending";
  }
}

function findLatestChildJobTxHash(job: SettlementChildJob): string | undefined {
  return (
    job.completeTxHash ??
    job.rejectTxHash ??
    job.submitTxHash ??
    job.fundTxHash ??
    job.budgetTxHash ??
    job.linkTxHash ??
    job.createTxHash
  );
}

function buildChildJobReceiptSummary(job: SettlementChildJob): string {
  const txHash = findLatestChildJobTxHash(job);

  return [
    job.role,
    job.status,
    job.lifecycleStatus,
    `action ${job.requestedAction}`,
    job.jobId ?? job.syntheticJobId ?? "pending",
    job.nextAction ? `next ${job.nextAction}` : null,
    txHash ? shortValue(txHash) : null,
  ]
    .filter((value): value is string => value != null)
    .join(" · ");
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
  const verificationStatus = decision?.erc8004VerificationStatus ?? provider?.erc8004?.verification?.status;
  const registered = decision?.erc8004Registered ?? (provider ? hasErc8004Registration(provider) : false);
  const registrationTx = decision?.registrationTx ?? provider?.erc8004?.registrationTx;
  const registrationTxFound = decision?.registrationTxFound ?? provider?.erc8004?.verification?.registrationTxFound;
  const operatorMatchesOwner = decision?.operatorMatchesOwner ?? provider?.erc8004?.verification?.operatorMatchesOwner;
  const parts = [
    buildErc8004ProofLabel(verificationStatus, registered),
    registrationTxFound === false ? "reg tx missing" : null,
    operatorMatchesOwner === false ? "owner mismatch" : null,
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

function buildAttestedRuntimeUrl(): string {
  return `${API_BASE}/v1/attested-runtime`;
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

function readQueryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Request failed.";
}
