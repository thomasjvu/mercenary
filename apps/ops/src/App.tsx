import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import {
  buildChildJobSummary,
  buildSettlementLifecycleLabel,
  shortValue,
} from '@bossraid/proof-ui';
import { ArtifactStrip, DocsButton, ProviderMesh, useRaidPolling } from '@bossraid/ui';
import useSWR from 'swr';
import {
  createOpsSession,
  deleteOpsSession,
  fetchOpsSessionStatus,
  fetchOpsSettings,
  fetchJson,
  updateOpsX402Enabled,
  type OpsSettings,
  type OpsSessionStatus,
  type Provider,
  type ProviderHealth,
  type RaidListItem,
  type RaidResult,
  type RaidStatus,
} from './api';
import { OpsAuthGate } from './components/OpsAuthGate';
import { OpsRaidList } from './components/OpsRaidList';
import {
  buildRoutingDecisionSummary,
  countUniqueProviders,
  formatMs,
  formatScore,
  formatTimestamp,
  formatUsd,
  Metric,
  ProviderRow,
  ReceiptRow,
  ScoreCard,
  SignalMeter,
  SignalTag,
  SnapshotRow,
  StatChip,
  WorkstreamCard,
  X402PaymentsToggle,
} from './components/ops-ui';
import { DEFAULT_SPAWN_PAYLOAD } from './default-payload';

export function App() {
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [raidId, setRaidId] = useState<string | null>(null);
  const [spawnPending, setSpawnPending] = useState(false);
  const [actionPending, setActionPending] = useState<'abort' | 'replay' | null>(null);
  const [receiptCopied, setReceiptCopied] = useState(false);
  const [providerQuery, setProviderQuery] = useState('');
  const [spawnPayload, setSpawnPayload] = useState(DEFAULT_SPAWN_PAYLOAD);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const [x402TogglePending, setX402TogglePending] = useState(false);
  const [x402ToggleError, setX402ToggleError] = useState<string | null>(null);
  const deferredProviderQuery = useDeferredValue(providerQuery);
  const opsSession = useSWR<OpsSessionStatus>('ops-session', fetchOpsSessionStatus, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });
  const opsReady = opsSession.data?.authenticated === true;
  const opsSettings = useSWR<OpsSettings>(opsReady ? 'ops-settings' : null, fetchOpsSettings, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });

  const health = useSWR<{ ok: boolean; providers: number; readyProviders: number }>(
    opsReady ? '/health' : null,
    (path: string) => fetchJson(path),
    { refreshInterval: 5_000 }
  );
  const raids = useSWR<RaidListItem[]>(
    opsReady ? '/v1/raids' : null,
    (path: string) => fetchJson(path),
    {
      refreshInterval: 3_000,
    }
  );
  const providers = useSWR<Provider[]>(
    opsReady ? '/v1/providers' : null,
    (path: string) => fetchJson(path),
    {
      refreshInterval: 8_000,
    }
  );
  const providerHealth = useSWR<ProviderHealth[]>(
    opsReady ? '/v1/providers/health' : null,
    (path: string) => fetchJson(path),
    {
      refreshInterval: 8_000,
    }
  );
  const { status: raidStatus, result: raidResult } = useRaidPolling<RaidStatus, RaidResult>(
    opsReady ? raidId : null,
    opsReady ? 'ops' : null,
    {
      intervalMs: 2_000,
      fetchStatus: () => fetchJson<RaidStatus>(`/v1/raids/${raidId}`),
      fetchResult: () => fetchJson<RaidResult>(`/v1/raids/${raidId}/result`),
    }
  );

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
      const spawn = await fetchJson<{ raidId: string }>('/v1/raid', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      startTransition(() => setRaidId(spawn.raidId));
      void Promise.all([raids.mutate(), raidStatus.mutate(), raidResult.mutate()]);
    } catch (error) {
      setSpawnError(error instanceof Error ? error.message : 'Launch failed.');
    } finally {
      setSpawnPending(false);
    }
  }

  async function handleOpsLogin() {
    if (adminTokenInput.trim().length === 0) {
      setAuthError('Admin token is required.');
      return;
    }

    setAuthPending(true);
    setAuthError(null);

    try {
      await createOpsSession(adminTokenInput.trim());
      setAdminTokenInput('');
      await Promise.all([
        opsSession.mutate(),
        health.mutate(),
        raids.mutate(),
        providers.mutate(),
        providerHealth.mutate(),
      ]);
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Ops login failed.');
    } finally {
      setAuthPending(false);
    }
  }

  async function handleX402Toggle(nextEnabled: boolean) {
    setX402TogglePending(true);
    setX402ToggleError(null);

    try {
      const settings = await updateOpsX402Enabled(nextEnabled);
      await opsSettings.mutate(settings, false);
    } catch (error) {
      setX402ToggleError(error instanceof Error ? error.message : 'Failed to update x402 setting.');
    } finally {
      setX402TogglePending(false);
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
      setAuthError(error instanceof Error ? error.message : 'Ops logout failed.');
    } finally {
      setAuthPending(false);
    }
  }

  async function handleAbortRaid() {
    if (!raidId) {
      return;
    }
    setActionPending('abort');
    try {
      await fetchJson(`/v1/raids/${raidId}/abort`, { method: 'POST' });
      await Promise.all([raidStatus.mutate(), raidResult.mutate(), raids.mutate()]);
    } finally {
      setActionPending(null);
    }
  }

  async function handleReplayEvaluation() {
    if (!raidId) {
      return;
    }
    setActionPending('replay');
    try {
      await fetchJson(`/v1/evaluations/${raidId}/replay`, { method: 'POST' });
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

  const activeProviders = (providers.data ?? []).filter(
    (provider) => provider.status === 'available'
  );
  const approvedProviders = raidResult.data?.settlementExecution?.successfulProviderIds.length
    ? raidResult.data.settlementExecution.successfulProviderIds
    : raidResult.data?.synthesizedOutput?.contributingProviderIds.length
      ? raidResult.data.synthesizedOutput.contributingProviderIds
      : (raidResult.data?.approvedSubmissions ?? []).map(
          (submission) => submission.submission.providerId
        );
  const canAbort =
    raidStatus.data && !['final', 'cancelled', 'expired'].includes(raidStatus.data.status);
  const canReplay = raidStatus.data && ['first_valid', 'final'].includes(raidStatus.data.status);
  const dangerState = (health.data?.readyProviders ?? 0) === 0;
  const runningState =
    raidStatus.data?.status === 'running' || raidStatus.data?.status === 'evaluating';
  const expertStates = raidStatus.data?.experts ?? [];
  const engagedExperts = expertStates.filter(
    (expert) => !['timed_out', 'failed', 'invalid'].includes(expert.status)
  ).length;
  const providerTotal = Math.max(health.data?.providers ?? providers.data?.length ?? 0, 6);
  const activeRaidId = selectedRaid?.raidId ?? 'no active raid';
  const rankedSubmissions = raidResult.data?.rankedSubmissions ?? [];
  const synthesizedOutput = raidResult.data?.synthesizedOutput;
  const synthesizedWorkstreams = synthesizedOutput?.workstreams ?? [];
  const synthesizedArtifacts = synthesizedOutput?.artifacts ?? [];
  const routingProof = raidResult.data?.routingProof;
  const routingDecisions = routingProof?.providers ?? [];
  const settlementExecution = raidResult.data?.settlementExecution;
  const reputationEvents = raidResult.data?.reputationEvents ?? [];
  const erc8004ProviderCount = countUniqueProviders(
    routingDecisions,
    (decision) => decision.erc8004Registered
  );
  const verifiedErc8004ProviderCount = countUniqueProviders(
    routingDecisions,
    (decision) => decision.erc8004VerificationStatus === 'verified'
  );
  const veniceProviderCount = countUniqueProviders(
    routingDecisions,
    (decision) => decision.veniceBacked
  );
  const trustScoredProviderCount = countUniqueProviders(
    routingDecisions,
    (decision) => decision.trustScore > 0
  );
  const authMessage =
    authError ?? (opsSession.error instanceof Error ? opsSession.error.message : null);

  if (!opsReady) {
    return (
      <OpsAuthGate
        adminTokenInput={adminTokenInput}
        authMessage={authMessage}
        authPending={authPending}
        onSubmit={() => void handleOpsLogin()}
        onTokenChange={setAdminTokenInput}
      />
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
              <StatChip label="core" value={health.data?.ok ? 'online' : 'offline'} />
              <StatChip label="ready" value={String(health.data?.readyProviders ?? 0)} />
              <StatChip label="live" value={String(activeProviders.length)} />
              <StatChip label="raids" value={String(raids.data?.length ?? 0)} />
            </div>
          </div>

          <X402PaymentsToggle
            disabled={x402TogglePending || opsSettings.isLoading}
            enabled={opsSettings.data?.x402.enabled ?? false}
            error={x402ToggleError}
            settings={opsSettings.data?.x402}
            onToggle={(nextEnabled) => {
              void handleX402Toggle(nextEnabled);
            }}
          />

          <h1>
            <span className="ops-headline-line">Command the mesh.</span>
            <span className="ops-headline-line">
              <span className="ops-headline-accent">Mercenary</span> routes the raid.
            </span>
            <span className="ops-headline-line">Ops tracks proof, payout, and readiness.</span>
          </h1>

          <p className="ops-lede">
            Use the raid-native surface to launch work, inspect live provider movement, and settle
            only approved outputs.
          </p>

          <div className="ops-hero__action-row">
            <div className="ops-actions">
              <button
                className="button button--primary"
                disabled={spawnPending}
                onClick={handleSpawnRaid}
                type="button"
              >
                {spawnPending ? 'launching' : 'launch raid'}
              </button>
              <button
                className="button"
                disabled={!canReplay || actionPending != null}
                onClick={handleReplayEvaluation}
                type="button"
              >
                {actionPending === 'replay' ? 'replaying' : 're-score'}
              </button>
              <button
                className="button button--danger"
                disabled={!canAbort || actionPending != null}
                onClick={handleAbortRaid}
                type="button"
              >
                {actionPending === 'abort' ? 'aborting' : 'abort'}
              </button>
              <button
                className="button"
                disabled={authPending}
                onClick={handleOpsLogout}
                type="button"
              >
                {authPending ? 'locking' : 'lock ops'}
              </button>
              <DocsButton className="button ops-docs-link" />
            </div>
            <SignalMeter
              className="ops-hero__meter"
              value={health.data?.readyProviders ?? 0}
              total={providerTotal}
            />
          </div>

          <section className="ops-metrics" aria-label="Raid metrics">
            <Metric
              label="status"
              value={raidStatus.data?.status ?? selectedRaid?.status ?? 'idle'}
            />
            <Metric label="approved" value={String(approvedProviders.length)} />
            <Metric
              label="split"
              value={formatUsd(raidResult.data?.settlement?.payoutPerSuccessfulProvider)}
            />
            <Metric label="risk" value={raidStatus.data?.sanitization.riskTier ?? 'n/a'} />
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
                  label={runningState ? 'mesh live' : 'mesh idle'}
                  variant={runningState ? 'internal' : 'default'}
                  blinking={runningState}
                />
              </div>
              <div className="ops-window__body">
                <ProviderMesh
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
                  label={dangerState ? 'limits' : 'stable'}
                  variant={dangerState ? 'danger' : 'default'}
                  blinking={dangerState}
                />
              </div>
              <div className="snapshot-grid">
                <SnapshotRow
                  label="status"
                  value={raidStatus.data?.status ?? selectedRaid?.status ?? 'idle'}
                />
                <SnapshotRow label="created" value={formatTimestamp(selectedRaid?.createdAt)} />
                <SnapshotRow label="experts" value={String(engagedExperts)} />
                <SnapshotRow label="approved" value={String(approvedProviders.length)} />
                <SnapshotRow label="risk" value={raidStatus.data?.sanitization.riskTier ?? 'n/a'} />
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
            <OpsRaidList
              raids={raids.data ?? []}
              selectedRaidId={raidId}
              onSelect={(nextRaidId) => setRaidId(nextRaidId)}
            />
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
                    <span>{expert.message ?? 'awaiting work'}</span>
                  </div>
                  <div className="timeline-meta">
                    <span>{expert.status}</span>
                    <span>{formatMs(expert.latencyMs)}</span>
                  </div>
                </div>
              ))}
              {expertStates.length === 0 ? (
                <p className="quiet-note">No provider movement yet.</p>
              ) : null}
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
            {spawnError ? (
              <p className="error-note">{spawnError}</p>
            ) : (
              <p className="quiet-note">Native raid request body.</p>
            )}
          </article>

          <article className="ops-panel ops-panel--output">
            <div className="panel-head">
              <div>
                <p className="ops-label">synthesized output</p>
                <h3>
                  {synthesizedOutput?.contributingProviderIds.length
                    ? `${synthesizedOutput.contributingProviderIds.length} contributors`
                    : 'Pending'}
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
              <pre className="diff-preview">
                {raidResult.data.primarySubmission.submission.patchUnifiedDiff}
              </pre>
            ) : null}
            {synthesizedArtifacts.length ? (
              <ArtifactStrip artifacts={synthesizedArtifacts} />
            ) : null}
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
              {receiptCopied ? 'copied' : 'copy receipt'}
            </button>
          </div>
          <div className="receipt-grid">
            <ReceiptRow label="raid" value={activeRaidId} />
            <ReceiptRow
              label="status"
              value={raidResult.data?.status ?? selectedRaid?.status ?? 'idle'}
            />
            <ReceiptRow label="approved" value={String(approvedProviders.length)} />
            <ReceiptRow
              label="privacy mode"
              value={routingProof?.policy.privacyMode ?? 'pending'}
            />
            <ReceiptRow label="selection" value={routingProof?.policy.selectionMode ?? 'pending'} />
            <ReceiptRow
              label="venice lane"
              value={routingProof?.policy.venicePrivateLane ? 'active' : 'off'}
            />
            <ReceiptRow
              label="8004 required"
              value={routingProof?.policy.requireErc8004 ? 'yes' : 'no'}
            />
            <ReceiptRow
              label="min trust"
              value={
                routingProof?.policy.minTrustScore == null
                  ? 'none'
                  : String(routingProof.policy.minTrustScore)
              }
            />
            <ReceiptRow label="venice routed" value={String(veniceProviderCount)} />
            <ReceiptRow label="8004 routed" value={String(erc8004ProviderCount)} />
            <ReceiptRow label="8004 verified" value={String(verifiedErc8004ProviderCount)} />
            <ReceiptRow label="trust scored" value={String(trustScoredProviderCount)} />
            <ReceiptRow label="mode" value={settlementExecution?.mode ?? 'pending'} />
            <ReceiptRow label="proof" value={settlementExecution?.proofStandard ?? 'pending'} />
            <ReceiptRow
              label="lifecycle"
              value={buildSettlementLifecycleLabel(settlementExecution?.lifecycleStatus)}
            />
            <ReceiptRow label="artifact" value={settlementExecution?.artifactPath ?? 'pending'} />
            <ReceiptRow
              label="registry"
              value={settlementExecution?.registryRaidRef ?? 'pending'}
            />
            <ReceiptRow
              label="registry contract"
              value={settlementExecution?.contracts.registryAddress ?? 'pending'}
            />
            <ReceiptRow
              label="escrow contract"
              value={settlementExecution?.contracts.escrowAddress ?? 'pending'}
            />
            <ReceiptRow label="task hash" value={settlementExecution?.taskHash ?? 'pending'} />
            <ReceiptRow
              label="evaluation hash"
              value={settlementExecution?.evaluationHash ?? 'pending'}
            />
            <ReceiptRow
              label="finalize tx"
              value={shortValue(settlementExecution?.finalizeTxHash ?? 'pending')}
            />
            <ReceiptRow
              label="warnings"
              value={String(settlementExecution?.warnings?.length ?? 0)}
            />
          </div>

          <div className="receipt-list">
            <div className="receipt-list__section">
              <strong>routing proof</strong>
              {routingDecisions.length ? (
                routingDecisions.map((decision) => (
                  <div
                    className="receipt-row"
                    key={`${decision.providerId}-${decision.workstreamId ?? 'root'}-${decision.phase}`}
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
              <strong>warnings</strong>
              {settlementExecution?.warnings?.length ? (
                settlementExecution.warnings.map((warning) => (
                  <div className="receipt-row" key={warning}>
                    <span>warn</span>
                    <span>{warning}</span>
                  </div>
                ))
              ) : (
                <p className="quiet-note">No settlement warnings recorded.</p>
              )}
            </div>

            <div className="receipt-list__section">
              <strong>child jobs</strong>
              {settlementExecution?.childJobs.length ? (
                settlementExecution.childJobs.map((job) => (
                  <div className="receipt-row" key={job.jobRef}>
                    <span>{job.providerId}</span>
                    <span>{buildChildJobSummary(job)}</span>
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
                  <div
                    className="receipt-row"
                    key={`${event.providerId}-${event.type}-${event.timestamp}`}
                  >
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
                health={providerHealth.data?.find(
                  (item) => item.providerId === provider.providerId
                )}
              />
            ))}
            {filteredProviders.length === 0 ? (
              <p className="quiet-note">No providers match.</p>
            ) : null}
          </div>
        </article>
      </section>
    </main>
  );
}
