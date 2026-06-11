import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import { DocsButton, ProviderMesh, useRaidPolling } from '@bossraid/ui';
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
import { OpsProviderSidebar } from './components/OpsProviderSidebar';
import {
  OpsHeroStatRow,
  OpsRaidDetail,
  OpsRaidHeroMetrics,
  OpsRaidSnapshot,
} from './components/OpsRaidDetail';
import { SignalMeter, SignalTag, X402PaymentsToggle } from './components/ops-ui';
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
  const settlementExecution = raidResult.data?.settlementExecution;
  const reputationEvents = raidResult.data?.reputationEvents ?? [];
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
            <OpsHeroStatRow
              activeProviders={activeProviders.length}
              healthOk={health.data?.ok ?? false}
              raidCount={raids.data?.length ?? 0}
              readyProviders={health.data?.readyProviders ?? 0}
            />
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

          <OpsRaidHeroMetrics
            approvedProviderCount={approvedProviders.length}
            payoutPerSuccessfulProvider={raidResult.data?.settlement?.payoutPerSuccessfulProvider}
            raidStatus={raidStatus.data}
            selectedRaid={selectedRaid}
          />
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

            <OpsRaidSnapshot
              activeRaidId={activeRaidId}
              approvedProviderCount={approvedProviders.length}
              dangerState={dangerState}
              engagedExperts={engagedExperts}
              raidStatus={raidStatus.data}
              selectedRaid={selectedRaid}
            />
          </div>
        </div>
      </section>

      <OpsRaidDetail
        activeRaidId={activeRaidId}
        approvedProviders={approvedProviders}
        engagedExperts={engagedExperts}
        expertStates={expertStates}
        rankedSubmissions={rankedSubmissions}
        raidId={raidId}
        raidResult={raidResult.data}
        raidStatus={raidStatus.data}
        raids={raids.data ?? []}
        receiptCopied={receiptCopied}
        reputationEvents={reputationEvents}
        routingProof={routingProof}
        selectedRaid={selectedRaid}
        settlementExecution={settlementExecution}
        spawnError={spawnError}
        spawnPayload={spawnPayload}
        synthesizedArtifacts={synthesizedArtifacts}
        synthesizedOutput={synthesizedOutput}
        synthesizedWorkstreams={synthesizedWorkstreams}
        onCopyReceipt={() => void handleCopyReceipt()}
        onSelectRaid={setRaidId}
        onSpawnPayloadChange={setSpawnPayload}
      />

      <OpsProviderSidebar
        filteredProviders={filteredProviders}
        providerHealth={providerHealth.data}
        providerQuery={providerQuery}
        onQueryChange={setProviderQuery}
      />
    </main>
  );
}
