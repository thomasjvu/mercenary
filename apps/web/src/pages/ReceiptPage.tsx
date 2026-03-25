import { useEffect, useMemo, useState, type FormEvent } from "react";
import useSWR from "swr";
import heroImage from "../../../../assets/hero.webp";
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
type SubmissionArtifact = NonNullable<NonNullable<RaidResult["synthesizedOutput"]>["artifacts"]>[number];
type Erc8004VerificationStatus = NonNullable<NonNullable<Provider["erc8004"]>["verification"]>["status"];
type ReceiptProviderRowData = {
  providerId: string;
  displayName: string;
  state: string;
  assignment: string;
  proof: string;
  reason: string;
};

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
  const veniceProviderCount = countProvidersWithSignal(routingDecisionMap, (decision) => decision.veniceBacked);
  const teeProviderCount = countProvidersWithSignal(
    routingDecisionMap,
    (decision) => decision.privacyFeatures.includes("tee_attested"),
  );
  const signedProviderCount = countProvidersWithSignal(
    routingDecisionMap,
    (decision) => decision.privacyFeatures.includes("signed_outputs"),
  );
  const runtimeSignerDisabled = isAttestationSignerUnavailable(attestedRuntime.error?.message);
  const resultSignerDisabled = isAttestationSignerUnavailable(attestedResult.error?.message);
  const runtimeAttestationStatus = attestedRuntime.data
    ? "live"
    : runtimeSignerDisabled
      ? "proof unpublished"
      : attestedRuntime.error
        ? "unavailable"
        : "loading";
  const resultAttestationStatus = attestedResult.data
    ? "live"
    : resultSignerDisabled
      ? "proof unpublished"
      : attestedResult.error
        ? "unavailable"
        : activeQuery
          ? "loading"
          : "pending";
  const attestationTarget =
    attestedResult.data?.payload.deploymentTarget ??
    attestedRuntime.data?.payload.deploymentTarget ??
    (runtimeSignerDisabled || resultSignerDisabled ? "not published" : "pending");
  const attestationTee =
    attestedResult.data?.payload.teePlatform ??
    attestedRuntime.data?.payload.teePlatform ??
    (runtimeSignerDisabled || resultSignerDisabled ? "provider TEE live" : "pending");
  const attestationSurfaceLabel =
    attestedResult.data || attestedRuntime.data
      ? buildAttestationSurfaceLabel(attestationTarget, attestationTee)
      : runtimeSignerDisabled || resultSignerDisabled
        ? "Host proof unpublished"
        : buildAttestationSurfaceLabel(attestationTarget, attestationTee);
  const currentReceiptStatus = result.data?.status ?? status.data?.status ?? "loading";
  const canonicalSummary = summarizeCanonicalOutput(result.data);
  const previewArtifacts = pickPreviewArtifacts(synthesizedArtifacts);
  const approvedSubmissionCount = result.data?.approvedSubmissions?.length ?? approvedProviders.length;
  const successfulProviderCount =
    result.data?.settlement?.successfulProviderCount ??
    settlementExecution?.successfulProviderIds.length ??
    approvedProviders.length;
  const payoutPerSuccessfulProvider = result.data?.settlement?.payoutPerSuccessfulProvider;
  const primaryOutputType =
    result.data?.synthesizedOutput?.primaryType ??
    (result.data?.primarySubmission?.submission.patchUnifiedDiff ? "patch" : "pending");
  const providerRows = buildReceiptProviderRows(
    routedProviderIds,
    routingDecisionMap,
    providerMap,
    approvedProviders,
    supportingProviders,
    droppedProviders,
  );
  const settlementWarnings = settlementExecution?.warnings ?? [];
  const childJobCount = settlementExecution?.childJobs.length ?? 0;
  const visibleWorkstreams = workstreams.slice(0, 4);

  return (
    <section className="receipt-shell receipt-shell--viewport" id="receipt">
      <div className="receipt-shell__hero">
        <div className="receipt-shell__copy">
          <p className="eyebrow">shareable receipt</p>
          <h1>
            <span className="directory-hero__headline-line">One raid.</span>
            <span className="directory-hero__headline-line">One receipt.</span>
          </h1>
          <p className="lede receipt-shell__lede">Load one run, its result, proof links, and settlement record.</p>
          <div className="directory-hero__actions">
            <button className="button button--primary" disabled={!activeQuery} onClick={handleCopyLink} type="button">
              {shareCopied ? "copied" : "copy link"}
            </button>
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
          </div>
        </div>

        <aside className="page-stage-card page-stage-card--receipt">
          <img
            alt=""
            aria-hidden="true"
            className="page-stage-card__image"
            loading="lazy"
            src={heroImage}
            style={{ objectPosition: "50% 62%" }}
          />
          <div className="page-stage-card__scrim" />
          <div className="page-stage-card__copy">
            <p className="eyebrow">{activeQuery ? "loaded proof lane" : "proof lane"}</p>
            <strong>{activeQuery ? currentReceiptStatus : "awaiting receipt"}</strong>
            <p>
              {activeQuery
                ? `${approvedSubmissionCount} approved · ${successfulProviderCount} successful · ${runtimeAttestationStatus} runtime`
                : "Load one raid to inspect output, proof, settlement, and provider lineage in a single receipt."}
            </p>
          </div>
          <div className="page-stage-card__summary">
            <SummaryPill label="runtime" value={runtimeAttestationStatus} />
            <SummaryPill label="result" value={activeQuery ? resultAttestationStatus : "pending"} />
            <SummaryPill
              label="split"
              value={
                payoutPerSuccessfulProvider == null
                  ? "pending"
                  : `${successfulProviderCount} x ${formatUsd(payoutPerSuccessfulProvider)}`
              }
            />
            <SummaryPill label="tee" value={`${teeProviderCount}/${routedProviderIds.length || 0}`} />
          </div>
        </aside>
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
          <a className="button" href={buildAttestedRuntimeUrl()} rel="noreferrer" target="_blank">
            runtime proof
          </a>
        </div>
      </form>

      <div className="receipt-shell__body">
        {!activeQuery ? (
          <article className="receipt-empty receipt-empty--viewport">
          <p className="eyebrow">capability link</p>
          <h2>Load one raid receipt.</h2>
          <p>Use the `raidId` and `raidAccessToken` returned by one raid run.</p>
          <pre className="code-panel receipt-empty__code">/receipt?raidId=&lt;raidId&gt;&amp;token=&lt;raidAccessToken&gt;</pre>
          <div className="receipt-empty__actions">
            {PINNED_PROOF_RECEIPT_URL ? (
              <a className="button button--primary" href={PINNED_PROOF_RECEIPT_URL}>
                open pinned receipt
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
          </div>
          <p>
            {PINNED_PROOF_RECEIPT_URL
              ? "Use the pinned receipt for a no-wallet proof path, or open /demo to launch a new hosted raid."
              : "Set VITE_BOSSRAID_PROOF_RECEIPT_URL to pin one recent proof URL for judges."}
          </p>
          <p>
            {attestedRuntime.data
              ? `${buildAttestationSurfaceLabel(
                  attestedRuntime.data.payload.deploymentTarget ?? "unknown",
                  attestedRuntime.data.payload.teePlatform ?? "unknown",
                )} runtime proof is live.`
              : runtimeSignerDisabled
                ? "Provider TEE signals are still live, but this host is not publishing a signed runtime envelope because MNEMONIC is not configured."
                : attestedRuntime.error
                  ? readQueryErrorMessage(attestedRuntime.error)
                  : "Loading runtime attestation."}
          </p>
          </article>
        ) : null}

        {status.error || result.error ? (
          <article className="receipt-empty receipt-empty--error receipt-empty--viewport">
            <p className="eyebrow">load failed</p>
            <h2>Receipt access was rejected.</h2>
            <p>{status.error?.message ?? result.error?.message}</p>
          </article>
        ) : null}

        {activeQuery && !status.error && !result.error ? (
          <section className="receipt-dashboard receipt-dashboard--scroll">
            <article className="receipt-surface receipt-surface--wide">
              <div className="receipt-surface__head">
                <div>
                  <p className="eyebrow">result</p>
                  <h2>Output</h2>
                </div>
                <span className="receipt-state">{currentReceiptStatus}</span>
              </div>
              <div className="receipt-outcome">
                <div className="receipt-outcome__copy">
                  <strong className="receipt-kicker">{primaryOutputType}</strong>
                  <p className="receipt-panel__text receipt-panel__text--clamped">{canonicalSummary}</p>
                  <div className="receipt-stat-grid">
                    <ReceiptStat label="type" value={primaryOutputType} />
                    <ReceiptStat label="workstreams" value={String(workstreams.length)} />
                    <ReceiptStat label="artifacts" value={String(synthesizedArtifacts.length)} />
                    <ReceiptStat label="approved" value={String(approvedSubmissionCount)} />
                  </div>
                  {visibleWorkstreams.length > 0 ? (
                    <div className="receipt-workstream-list">
                      {visibleWorkstreams.map((workstream) => (
                        <div className="receipt-workstream-row" key={workstream.id}>
                          <strong>{workstream.label}</strong>
                          <span>{compactText(workstream.shortSummary ?? workstream.summary, 120)}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {previewArtifacts.length ? (
                  <div className="receipt-preview-stack">
                    {previewArtifacts.map((artifact) => (
                      <ArtifactPreview artifact={artifact} key={`${artifact.outputType}-${artifact.uri}`} />
                    ))}
                  </div>
                ) : null}
              </div>
            </article>

            <article className="receipt-surface">
              <div className="receipt-surface__head">
                <div>
                  <p className="eyebrow">proof</p>
                  <h2>Attestation</h2>
                </div>
              </div>
              <div className="receipt-stat-grid">
                <ReceiptStat label="runtime" value={runtimeAttestationStatus} />
                <ReceiptStat label="result" value={resultAttestationStatus} />
                <ReceiptStat label="target" value={attestationTarget} />
                <ReceiptStat label="tee" value={attestationTee} />
                <ReceiptStat label="tee providers" value={`${teeProviderCount}/${routedProviderIds.length || 0}`} />
                <ReceiptStat label="signed" value={`${signedProviderCount}/${routedProviderIds.length || 0}`} />
              </div>
              <div className="receipt-proof-note receipt-proof-note--inline">
                <strong>TEE proof:</strong>{" "}
                {runtimeSignerDisabled || resultSignerDisabled
                  ? "Provider TEE and signed-output counts still reflect routed provider proofs, but this host is not publishing signed runtime/result envelopes because MNEMONIC is not configured."
                  : `${attestationSurfaceLabel} runtime proof and signed raid result proof are exposed here when the host signer is configured.`}
              </div>
              <div className="receipt-link-list">
                <ReceiptLinkItem
                  href={buildAttestedRuntimeUrl()}
                  label="runtime attestation"
                  note={`${attestationSurfaceLabel} runtime proof`}
                />
                <ReceiptLinkItem
                  href={buildAttestedResultUrl(activeQuery)}
                  label="result attestation"
                  note={`${attestationSurfaceLabel} result proof`}
                />
                <ReceiptLinkItem href={buildAgentLogUrl(activeQuery)} label="agent log" note="token-gated run log" />
                <ReceiptLinkItem
                  href={buildAgentManifestUrl()}
                  label="Mercenary manifest"
                  note="public orchestrator manifest"
                />
              </div>
              <details className="receipt-disclosure">
                <summary>show hashes</summary>
                <div className="receipt-detail-list">
                  <ReceiptDetailRow label="runtime signer" value={shortValue(attestedRuntime.data?.signer ?? "pending")} />
                  <ReceiptDetailRow
                    label="result hash"
                    value={shortValue(attestedResult.data?.payload.resultHash ?? settlementExecution?.evaluationHash ?? "pending")}
                  />
                  <ReceiptDetailRow label="message hash" value={shortValue(attestedResult.data?.messageHash ?? "pending")} />
                </div>
              </details>
            </article>

            <article className="receipt-surface">
              <div className="receipt-surface__head">
                <div>
                  <p className="eyebrow">raiders</p>
                  <h2>Providers</h2>
                </div>
              </div>
              <div className="receipt-provider-list">
                {providerRows.length ? (
                  providerRows.map((row) => (
                    <ReceiptProviderRow key={row.providerId} row={row} />
                  ))
                ) : (
                  <p className="receipt-panel__muted">No routed providers recorded yet.</p>
                )}
              </div>
            </article>

            <article className="receipt-surface">
              <div className="receipt-surface__head">
                <div>
                  <p className="eyebrow">settlement</p>
                  <h2>Settlement</h2>
                </div>
              </div>
              <div className="receipt-stat-grid">
                <ReceiptStat label="proof" value={settlementExecution?.proofStandard ?? "pending"} />
                <ReceiptStat label="lifecycle" value={buildSettlementLifecycleLabel(settlementExecution?.lifecycleStatus)} />
                <ReceiptStat label="successful" value={String(successfulProviderCount)} />
                <ReceiptStat
                  label="payout each"
                  value={payoutPerSuccessfulProvider == null ? "pending" : formatUsd(payoutPerSuccessfulProvider)}
                />
              </div>
              <div className="receipt-proof-note receipt-proof-note--inline">
                <strong>Payout rule:</strong> Successful raiders split payout equally.
              </div>
              <div className="receipt-detail-list">
                <ReceiptDetailRow label="mode" value={settlementExecution?.mode ?? "pending"} />
                <ReceiptDetailRow label="child jobs" value={String(childJobCount)} />
                <ReceiptDetailRow
                  label="8004 verified"
                  value={`${verifiedErc8004ProviderCount}/${erc8004ProviderCount || routedProviderIds.length || 0}`}
                />
                <ReceiptDetailRow label="venice routed" value={String(veniceProviderCount)} />
              </div>
              <details className="receipt-disclosure">
                <summary>show settlement fields</summary>
                <div className="receipt-detail-list">
                  <ReceiptDetailRow label="registry ref" value={shortValue(settlementExecution?.registryRaidRef ?? "pending")} />
                  <ReceiptDetailRow label="evaluation hash" value={shortValue(settlementExecution?.evaluationHash ?? "pending")} />
                  {settlementWarnings[0] ? <ReceiptDetailRow label="warning" value={settlementWarnings[0]} /> : null}
                </div>
              </details>
            </article>
          </section>
        ) : null}
      </div>
    </section>
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

function ReceiptLinkItem({
  href,
  label,
  note,
}: {
  href: string;
  label: string;
  note: string;
}) {
  return (
    <a className="receipt-link-item" href={href} rel="noreferrer" target="_blank">
      <span>{label}</span>
      <strong>{note}</strong>
      <small>open</small>
    </a>
  );
}

function ReceiptStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="receipt-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReceiptDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="receipt-detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReceiptProviderRow({ row }: { row: ReceiptProviderRowData }) {
  return (
    <div className="receipt-provider-row">
      <div className="receipt-provider-row__head">
        <strong>{row.displayName}</strong>
        <span className="receipt-provider-row__state">{row.state}</span>
      </div>
      <p>{compactText(row.assignment, 84)}</p>
      <small>{compactText([row.proof, row.reason].filter((value) => value.length > 0).join(" · "), 120)}</small>
    </div>
  );
}

function ArtifactPreview({ artifact }: { artifact: SubmissionArtifact }) {
  if (isRenderableImageArtifact(artifact)) {
    return (
      <img
        alt={artifact.label}
        className="receipt-preview-media"
        loading="lazy"
        src={artifact.uri}
      />
    );
  }

  if (isRenderableVideoArtifact(artifact)) {
    return <video className="receipt-preview-media" controls preload="metadata" src={artifact.uri} />;
  }

  return (
    <div className="receipt-preview-fallback">
      <span>{artifact.outputType}</span>
      <strong>{artifact.label}</strong>
    </div>
  );
}

function pickPreviewArtifacts(artifacts: SubmissionArtifact[]): SubmissionArtifact[] {
  return artifacts.filter((artifact) => isRenderableImageArtifact(artifact) || isRenderableVideoArtifact(artifact)).slice(0, 1);
}

function summarizeCanonicalOutput(result: RaidResult | undefined): string {
  if (!result) {
    return "Loading receipt proof.";
  }

  const summary =
    result.synthesizedOutput?.answerText ??
    result.synthesizedOutput?.explanation ??
    result.primarySubmission?.submission.answerText ??
    result.primarySubmission?.submission.explanation;

  if (summary && summary.trim().length > 0) {
    return compactText(summary, 220);
  }

  if (result.synthesizedOutput?.patchUnifiedDiff || result.primarySubmission?.submission.patchUnifiedDiff) {
    return "Patch-backed result is ready. Open the agent log for the full run trace and the attested result for the signed proof payload.";
  }

  return "Waiting for an approved canonical output.";
}

function compactText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sentenceBoundary = normalized.slice(0, maxLength).match(/^(.+[.!?])\s/);
  if (sentenceBoundary?.[1]) {
    return sentenceBoundary[1];
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildReceiptProviderRows(
  providerIds: string[],
  routingDecisionMap: Map<string, RoutingDecision[]>,
  providerMap: Map<string, Provider>,
  approvedProviders: string[],
  supportingProviders: string[],
  droppedProviders: string[],
): ReceiptProviderRowData[] {
  return providerIds.map((providerId) => {
    const provider = providerMap.get(providerId);
    const decision = matchRoutingDecision(routingDecisionMap.get(providerId));
    const state = approvedProviders.includes(providerId)
      ? "approved"
      : supportingProviders.includes(providerId)
        ? "supporting"
        : droppedProviders.includes(providerId)
          ? "dropped"
          : "routed";

    return {
      providerId,
      displayName: provider?.displayName ?? providerId,
      state,
      assignment: [decision?.workstreamLabel, decision?.roleLabel].filter((value): value is string => Boolean(value)).join(" / ") || "routed provider",
      proof: compactText(buildProviderProofNote(decision, provider), 72),
      reason: compactText(buildRoutingReasonNote(decision), 96),
    };
  });
}

function formatUsd(value?: number): string {
  return value == null ? "$0.00" : `$${value.toFixed(2)}`;
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
    privacyFeatures.has("tee_attested") ? "tee attested" : null,
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

function buildAttestedResultUrl(query: ReceiptQuery): string {
  return `${API_BASE}/v1/raid/${encodeURIComponent(query.raidId)}/attested-result?token=${encodeURIComponent(query.token)}`;
}

function buildAgentLogUrl(query: ReceiptQuery): string {
  return `${API_BASE}/v1/raids/${encodeURIComponent(query.raidId)}/agent_log.json?token=${encodeURIComponent(query.token)}`;
}

function buildAttestationSurfaceLabel(target: string | null | undefined, teePlatform: string | null | undefined): string {
  const haystack = `${target ?? ""} ${teePlatform ?? ""}`.toLowerCase();
  if (haystack.includes("phala")) {
    return "Phala TEE-attested";
  }
  if (haystack.includes("eigen")) {
    return "EigenCompute TEE-attested";
  }
  if (teePlatform != null && teePlatform.trim().length > 0) {
    return `${teePlatform} TEE-attested`;
  }
  return "TEE-attested";
}

function isAttestationSignerUnavailable(message: string | undefined): boolean {
  return typeof message === "string" && message.includes("MNEMONIC environment variable is required");
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
