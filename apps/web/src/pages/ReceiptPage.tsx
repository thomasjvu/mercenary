import { useEffect, useMemo, useState, type FormEvent } from 'react';
import useSWR from 'swr';
import {
  buildProviderProofNote,
  buildRoutingReasonNote,
  buildSettlementLifecycleLabel,
  DEFAULT_TERMINAL_RAID_STATUSES,
  isRenderableImageArtifact,
  isRenderableVideoArtifact,
  matchRoutingDecision,
  raidPollingRefreshInterval,
  shortValue,
  uniqueStrings,
} from '@bossraid/proof-ui';
import { ArtifactPreview, ReceiptProofPanel, useRaidPolling } from '@bossraid/ui';
import heroImage from '../../../../assets/hero.webp';
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
} from '../api';

type AppRoute = '/' | '/demo' | '/raiders' | '/receipt';

type ReceiptPageProps = {
  onNavigate: (path: AppRoute) => void;
};

type ReceiptQuery = {
  raidId: string;
  token: string;
};

type RoutingDecision = NonNullable<RaidResult['routingProof']>['providers'][number];
type SettlementExecution = NonNullable<RaidResult['settlementExecution']>;
type SubmissionArtifact = NonNullable<
  NonNullable<RaidResult['synthesizedOutput']>['artifacts']
>[number];
type ReceiptProviderRowData = {
  providerId: string;
  displayName: string;
  state: string;
  assignment: string;
  proof: string;
  reason: string;
};

const TERMINAL_STATUSES = DEFAULT_TERMINAL_RAID_STATUSES;
const PINNED_PROOF_RECEIPT_URL =
  (import.meta.env.VITE_BOSSRAID_PROOF_RECEIPT_URL as string | undefined)?.trim() ?? '';

export function ReceiptPage({ onNavigate }: ReceiptPageProps) {
  const initialQuery = useMemo(readReceiptQuery, []);
  const [raidIdInput, setRaidIdInput] = useState(initialQuery?.raidId ?? '');
  const [tokenInput, setTokenInput] = useState(initialQuery?.token ?? '');
  const [activeQuery, setActiveQuery] = useState<ReceiptQuery | null>(initialQuery);
  const [shareCopied, setShareCopied] = useState(false);

  const { status, result, statusIsTerminal } = useRaidPolling(
    activeQuery?.raidId,
    activeQuery?.token,
    {
      enabled: Boolean(activeQuery),
      fetchStatus: () => fetchRaidStatus(activeQuery!.raidId, activeQuery!.token),
      fetchResult: () => fetchRaidResult(activeQuery!.raidId, activeQuery!.token),
    }
  );
  const providers = useSWR<Provider[]>(
    activeQuery ? '/v1/providers' : null,
    (path: string) => fetchJson(path),
    {
      revalidateOnFocus: false,
    }
  );
  const attestedRuntime = useSWR<AttestedEnvelope<AttestedRuntimePayload>>(
    'receipt-attested-runtime',
    () => fetchAttestedRuntime(),
    {
      revalidateOnFocus: false,
    }
  );
  const attestedResult = useSWR<AttestedEnvelope<AttestedRaidResultPayload>>(
    activeQuery
      ? (['receipt-attested-result', activeQuery.raidId, activeQuery.token] as const)
      : null,
    ([, raidId, token]: readonly [string, string, string]) =>
      fetchAttestedRaidResult(raidId, token),
    {
      refreshInterval: () =>
        raidPollingRefreshInterval({
          enabled: Boolean(activeQuery),
          status: status.data?.status,
        }),
      revalidateOnFocus: true,
    }
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
    window.history.replaceState({}, '', buildReceiptPath(next));
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
        : (result.data?.approvedSubmissions ?? []).map(
            (submission) => submission.submission.providerId
          )
  );
  const supportingProviders = uniqueStrings(
    (result.data?.synthesizedOutput?.supportingProviderIds ?? []).filter(
      (providerId) => !approvedProviders.includes(providerId)
    )
  );
  const droppedProviders = uniqueStrings(result.data?.synthesizedOutput?.droppedProviderIds ?? []);
  const workstreams = result.data?.synthesizedOutput?.workstreams ?? [];
  const synthesizedArtifacts = result.data?.synthesizedOutput?.artifacts ?? [];
  const settlementExecution = result.data?.settlementExecution;
  const routingProof = result.data?.routingProof;
  const routingDecisions = routingProof?.providers ?? [];
  const providerMap = new Map(
    (providers.data ?? []).map((provider) => [provider.providerId, provider])
  );
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
  const erc8004ProviderCount = countProvidersWithSignal(
    routingDecisionMap,
    (decision) => decision.erc8004Registered
  );
  const verifiedErc8004ProviderCount = countProvidersWithSignal(
    routingDecisionMap,
    (decision) => decision.erc8004VerificationStatus === 'verified'
  );
  const veniceProviderCount = countProvidersWithSignal(
    routingDecisionMap,
    (decision) => decision.veniceBacked
  );
  const teeProviderCount = countProvidersWithSignal(routingDecisionMap, (decision) =>
    decision.privacyFeatures.includes('tee_attested')
  );
  const signedProviderCount = countProvidersWithSignal(routingDecisionMap, (decision) =>
    decision.privacyFeatures.includes('signed_outputs')
  );
  const runtimeSignerDisabled = isAttestationSignerUnavailable(attestedRuntime.error?.message);
  const resultSignerDisabled = isAttestationSignerUnavailable(attestedResult.error?.message);
  const runtimeAttestationStatus = attestedRuntime.data
    ? 'live'
    : runtimeSignerDisabled
      ? 'proof unpublished'
      : attestedRuntime.error
        ? 'unavailable'
        : 'loading';
  const resultAttestationStatus = attestedResult.data
    ? 'live'
    : resultSignerDisabled
      ? 'proof unpublished'
      : attestedResult.error
        ? 'unavailable'
        : activeQuery
          ? 'loading'
          : 'pending';
  const attestationTarget =
    attestedResult.data?.payload.deploymentTarget ??
    attestedRuntime.data?.payload.deploymentTarget ??
    (runtimeSignerDisabled || resultSignerDisabled ? 'not published' : 'pending');
  const attestationTee =
    attestedResult.data?.payload.teePlatform ??
    attestedRuntime.data?.payload.teePlatform ??
    (runtimeSignerDisabled || resultSignerDisabled ? 'provider TEE live' : 'pending');
  const attestationSurfaceLabel =
    attestedResult.data || attestedRuntime.data
      ? buildAttestationSurfaceLabel(attestationTarget, attestationTee)
      : runtimeSignerDisabled || resultSignerDisabled
        ? 'Host proof unpublished'
        : buildAttestationSurfaceLabel(attestationTarget, attestationTee);
  const currentReceiptStatus = result.data?.status ?? status.data?.status ?? 'loading';
  const canonicalSummary = summarizeCanonicalOutput(result.data);
  const previewArtifacts = pickPreviewArtifacts(synthesizedArtifacts);
  const approvedSubmissionCount =
    result.data?.approvedSubmissions?.length ?? approvedProviders.length;
  const successfulProviderCount =
    result.data?.settlement?.successfulProviderCount ??
    settlementExecution?.successfulProviderIds.length ??
    approvedProviders.length;
  const payoutPerSuccessfulProvider = result.data?.settlement?.payoutPerSuccessfulProvider;
  const primaryOutputType =
    result.data?.synthesizedOutput?.primaryType ??
    (result.data?.primarySubmission?.submission.patchUnifiedDiff ? 'patch' : 'pending');
  const providerRows = buildReceiptProviderRows(
    routedProviderIds,
    routingDecisionMap,
    providerMap,
    approvedProviders,
    supportingProviders,
    droppedProviders
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
          <p className="lede receipt-shell__lede">
            Load one run, its result, proof links, and settlement record.
          </p>
          <div className="directory-hero__actions">
            <button
              className="button button--primary"
              disabled={!activeQuery}
              onClick={handleCopyLink}
              type="button"
            >
              {shareCopied ? 'copied' : 'copy link'}
            </button>
            <a
              className="button"
              href="/demo"
              onClick={(event) => {
                event.preventDefault();
                onNavigate('/demo');
              }}
            >
              demo
            </a>
            <a
              className="button"
              href="/raiders"
              onClick={(event) => {
                event.preventDefault();
                onNavigate('/raiders');
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
            style={{ objectPosition: '50% 62%' }}
          />
          <div className="page-stage-card__scrim" />
          <div className="page-stage-card__copy">
            <p className="eyebrow">{activeQuery ? 'loaded proof lane' : 'proof lane'}</p>
            <strong>{activeQuery ? currentReceiptStatus : 'awaiting receipt'}</strong>
            <p>
              {activeQuery
                ? `${approvedSubmissionCount} approved · ${successfulProviderCount} successful · ${runtimeAttestationStatus} runtime`
                : 'Load one raid to inspect output, proof, settlement, and provider lineage in a single receipt.'}
            </p>
          </div>
          <div className="page-stage-card__summary">
            <SummaryPill label="runtime" value={runtimeAttestationStatus} />
            <SummaryPill label="result" value={activeQuery ? resultAttestationStatus : 'pending'} />
            <SummaryPill
              label="split"
              value={
                payoutPerSuccessfulProvider == null
                  ? 'pending'
                  : `${successfulProviderCount} x ${formatUsd(payoutPerSuccessfulProvider)}`
              }
            />
            <SummaryPill
              label="tee"
              value={`${teeProviderCount}/${routedProviderIds.length || 0}`}
            />
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
            <pre className="code-panel receipt-empty__code">
              /receipt?raidId=&lt;raidId&gt;&amp;token=&lt;raidAccessToken&gt;
            </pre>
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
                  onNavigate('/demo');
                }}
              >
                open live demo
              </a>
            </div>
            <p>
              {PINNED_PROOF_RECEIPT_URL
                ? 'Use the pinned receipt for a no-wallet proof path, or open /demo to launch a new hosted raid.'
                : 'Set VITE_BOSSRAID_PROOF_RECEIPT_URL to pin one recent proof URL for judges.'}
            </p>
            <p>
              {attestedRuntime.data
                ? `${buildAttestationSurfaceLabel(
                    attestedRuntime.data.payload.deploymentTarget ?? 'unknown',
                    attestedRuntime.data.payload.teePlatform ?? 'unknown'
                  )} runtime proof is live.`
                : runtimeSignerDisabled
                  ? 'Provider TEE signals are still live, but this host is not publishing a signed runtime envelope because MNEMONIC is not configured.'
                  : attestedRuntime.error
                    ? readQueryErrorMessage(attestedRuntime.error)
                    : 'Loading runtime attestation.'}
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
                  <p className="receipt-panel__text receipt-panel__text--clamped">
                    {canonicalSummary}
                  </p>
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
                          <span>
                            {compactText(workstream.shortSummary ?? workstream.summary, 120)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                {previewArtifacts.length ? (
                  <div className="receipt-preview-stack">
                    {previewArtifacts.map((artifact) => (
                      <ArtifactPreview
                        artifact={artifact}
                        key={`${artifact.outputType}-${artifact.uri}`}
                      />
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
              <ReceiptProofPanel
                attestationTarget={attestationTarget}
                attestationTee={attestationTee}
                links={[
                  {
                    href: buildAttestedRuntimeUrl(),
                    label: 'runtime attestation',
                    note: `${attestationSurfaceLabel} runtime proof`,
                  },
                  {
                    href: buildAttestedResultUrl(activeQuery),
                    label: 'result attestation',
                    note: `${attestationSurfaceLabel} result proof`,
                  },
                  {
                    href: buildAgentLogUrl(activeQuery),
                    label: 'agent log',
                    note: 'token-gated run log',
                  },
                  {
                    href: buildAgentManifestUrl(),
                    label: 'Mercenary manifest',
                    note: 'public orchestrator manifest',
                  },
                ]}
                messageHash={attestedResult.data?.messageHash}
                proofNote={
                  <>
                    <strong>TEE proof:</strong>{' '}
                    {runtimeSignerDisabled || resultSignerDisabled
                      ? 'Provider TEE and signed-output counts still reflect routed provider proofs, but this host is not publishing signed runtime/result envelopes because MNEMONIC is not configured.'
                      : `${attestationSurfaceLabel} runtime proof and signed raid result proof are exposed here when the host signer is configured.`}
                  </>
                }
                resultHash={
                  attestedResult.data?.payload.resultHash ?? settlementExecution?.evaluationHash
                }
                resultStatus={resultAttestationStatus}
                routedProviderCount={routedProviderIds.length}
                runtimeSigner={attestedRuntime.data?.signer}
                runtimeStatus={runtimeAttestationStatus}
                signedProviderCount={signedProviderCount}
                teeProviderCount={teeProviderCount}
              />
            </article>

            <article className="receipt-surface">
              <div className="receipt-surface__head">
                <div>
                  <p className="eyebrow">queued verified agents</p>
                  <h2>Providers</h2>
                </div>
              </div>
              <div className="receipt-provider-list">
                {providerRows.length ? (
                  providerRows.map((row) => <ReceiptProviderRow key={row.providerId} row={row} />)
                ) : (
                  <p className="receipt-panel__muted">No routed queued agents recorded yet.</p>
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
                <ReceiptStat
                  label="proof"
                  value={settlementExecution?.proofStandard ?? 'pending'}
                />
                <ReceiptStat
                  label="lifecycle"
                  value={buildSettlementLifecycleLabel(settlementExecution?.lifecycleStatus)}
                />
                <ReceiptStat label="successful" value={String(successfulProviderCount)} />
                <ReceiptStat
                  label="payout each"
                  value={
                    payoutPerSuccessfulProvider == null
                      ? 'pending'
                      : formatUsd(payoutPerSuccessfulProvider)
                  }
                />
              </div>
              <div className="receipt-proof-note receipt-proof-note--inline">
                <strong>Payout rule:</strong> Successful raiders split payout equally.
              </div>
              <div className="receipt-detail-list">
                <ReceiptDetailRow label="mode" value={settlementExecution?.mode ?? 'pending'} />
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
                  <ReceiptDetailRow
                    label="registry ref"
                    value={shortValue(settlementExecution?.registryRaidRef ?? 'pending')}
                  />
                  <ReceiptDetailRow
                    label="evaluation hash"
                    value={shortValue(settlementExecution?.evaluationHash ?? 'pending')}
                  />
                  {settlementWarnings[0] ? (
                    <ReceiptDetailRow label="warning" value={settlementWarnings[0]} />
                  ) : null}
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
      <small>
        {compactText([row.proof, row.reason].filter((value) => value.length > 0).join(' · '), 120)}
      </small>
    </div>
  );
}

function pickPreviewArtifacts(artifacts: SubmissionArtifact[]): SubmissionArtifact[] {
  return artifacts
    .filter(
      (artifact) => isRenderableImageArtifact(artifact) || isRenderableVideoArtifact(artifact)
    )
    .slice(0, 1);
}

function summarizeCanonicalOutput(result: RaidResult | undefined): string {
  if (!result) {
    return 'Loading receipt proof.';
  }

  const summary =
    result.synthesizedOutput?.answerText ??
    result.synthesizedOutput?.explanation ??
    result.primarySubmission?.submission.answerText ??
    result.primarySubmission?.submission.explanation;

  if (summary && summary.trim().length > 0) {
    return compactText(summary, 220);
  }

  if (
    result.synthesizedOutput?.patchUnifiedDiff ||
    result.primarySubmission?.submission.patchUnifiedDiff
  ) {
    return 'Patch-backed result is ready. Open the agent log for the full run trace and the attested result for the signed proof payload.';
  }

  return 'Waiting for an approved canonical output.';
}

function compactText(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
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
  droppedProviders: string[]
): ReceiptProviderRowData[] {
  return providerIds.map((providerId) => {
    const provider = providerMap.get(providerId);
    const decision = matchRoutingDecision(routingDecisionMap.get(providerId));
    const state = approvedProviders.includes(providerId)
      ? 'approved'
      : supportingProviders.includes(providerId)
        ? 'supporting'
        : droppedProviders.includes(providerId)
          ? 'dropped'
          : 'routed';

    return {
      providerId,
      displayName: provider?.displayName ?? providerId,
      state,
      assignment:
        [decision?.workstreamLabel, decision?.roleLabel]
          .filter((value): value is string => Boolean(value))
          .join(' / ') || 'routed provider',
      proof: compactText(buildProviderProofNote(decision, provider), 72),
      reason: compactText(buildRoutingReasonNote(decision), 96),
    };
  });
}

function formatUsd(value?: number): string {
  return value == null ? '$0.00' : `$${value.toFixed(2)}`;
}

function countProvidersWithSignal(
  routingDecisionMap: Map<string, RoutingDecision[]>,
  predicate: (decision: RoutingDecision) => boolean
): number {
  let count = 0;

  for (const decisions of routingDecisionMap.values()) {
    if (decisions.some(predicate)) {
      count += 1;
    }
  }

  return count;
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

function buildAttestationSurfaceLabel(
  target: string | null | undefined,
  teePlatform: string | null | undefined
): string {
  const haystack = `${target ?? ''} ${teePlatform ?? ''}`.toLowerCase();
  if (haystack.includes('phala')) {
    return 'Phala TEE-attested';
  }
  if (haystack.includes('eigen')) {
    return 'EigenCompute TEE-attested';
  }
  if (teePlatform != null && teePlatform.trim().length > 0) {
    return `${teePlatform} TEE-attested`;
  }
  return 'TEE-attested';
}

function isAttestationSignerUnavailable(message: string | undefined): boolean {
  return (
    typeof message === 'string' && message.includes('MNEMONIC environment variable is required')
  );
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
  if (typeof window === 'undefined') {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  const raidId = params.get('raidId') ?? params.get('raid_id') ?? '';
  const token =
    params.get('token') ?? params.get('raidAccessToken') ?? params.get('raid_access_token') ?? '';

  if (!raidId || !token) {
    return null;
  }

  return { raidId, token };
}

function readQueryErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.';
}
