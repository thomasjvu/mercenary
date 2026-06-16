import { NETWORK } from '@bossraid/constants';
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
import { OpsHeroStatRow, OpsRaidDetail, OpsRaidHeroMetrics } from './components/OpsRaidDetail';
import {
  OpsMetricsPanel,
  ProductionReadinessPanel,
  SettlementStatusPanel,
} from './components/OpsReliabilityPanels';
import { SignalMeter, SignalTag, X402PaymentsToggle } from './components/ops-ui';
import { DEFAULT_SPAWN_PAYLOAD } from './default-payload';

type OpsTheme = 'light' | 'dark';

function readStoredOpsTheme(): OpsTheme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const stored = window.localStorage.getItem('bossraid-ops-theme');
  return stored === 'dark' ? 'dark' : 'light';
}

export function App() {
  const [appTheme, setAppTheme] = useState<OpsTheme>(readStoredOpsTheme);
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
      fetchStatus: () => fetchJson<RaidStatus>(`/v1/raid/${raidId}`),
      fetchResult: () => fetchJson<RaidResult>(`/v1/raid/${raidId}/result`),
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
      await fetchJson(`/v1/raid/${raidId}/abort`, { method: 'POST' });
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

  function handleThemeToggle() {
    setAppTheme((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      window.localStorage.setItem('bossraid-ops-theme', next);
      return next;
    });
  }

  if (!opsReady) {
    return (
      <div
        className={`ops-frame ops-frame--theme-${appTheme}${appTheme === 'dark' ? ' bossraid-surface-dark' : ''}`}
      >
        <div className="bg-grid" aria-hidden="true" />
        <OpsAuthGate
          adminTokenInput={adminTokenInput}
          appTheme={appTheme}
          authMessage={authMessage}
          authPending={authPending}
          onSubmit={() => void handleOpsLogin()}
          onThemeToggle={handleThemeToggle}
          onTokenChange={setAdminTokenInput}
        />
      </div>
    );
  }

  return (
    <div
      className={`ops-frame ops-frame--theme-${appTheme}${appTheme === 'dark' ? ' bossraid-surface-dark' : ''}`}
    >
      <div className="bg-grid" aria-hidden="true" />
      <header className="ops-topbar">
        <div className="ops-topbar__brand">
          <strong>Boss Raid Ops</strong>
          <span>mercenary-v1 / control plane</span>
        </div>
        <div className="ops-topbar__actions">
          <a
            className="ops-public-link button"
            href={`http://${NETWORK.LOCALHOST}:${NETWORK.LOCAL_WEB_PORT}`}
          >
            public app
          </a>
          <button className="button" onClick={handleThemeToggle} type="button">
            {appTheme === 'dark' ? 'light mode' : 'dark mode'}
          </button>
          <button
            className="button"
            disabled={authPending}
            onClick={() => void handleOpsLogout()}
            type="button"
          >
            {authPending ? 'locking' : 'lock ops'}
          </button>
          <DocsButton className="button ops-docs-link" />
        </div>
      </header>

      <main className="ops-stage">
        <header className="page-hero page-hero--compact ops-hero">
          <div className="page-hero__main">
            <p className="eyebrow">control plane</p>
            <h1>
              Command the mesh. <span className="ops-headline-accent">Mercenary</span> routes the
              raid.
            </h1>
            <p className="lede">
              Launch raids, inspect provider movement, replay evaluation, toggle x402, and review
              settlement proof.
            </p>
            <div className="page-hero__actions ops-actions">
              <button
                className="button button--primary"
                disabled={spawnPending}
                onClick={() => void handleSpawnRaid()}
                type="button"
              >
                {spawnPending ? 'launching' : 'launch raid'}
              </button>
              <button
                className="button"
                disabled={!canReplay || actionPending != null}
                onClick={() => void handleReplayEvaluation()}
                type="button"
              >
                {actionPending === 'replay' ? 'replaying' : 're-score'}
              </button>
              <button
                className="button button--danger"
                disabled={!canAbort || actionPending != null}
                onClick={() => void handleAbortRaid()}
                type="button"
              >
                {actionPending === 'abort' ? 'aborting' : 'abort'}
              </button>
            </div>
          </div>
          <aside className="page-hero__aside">
            <SignalMeter
              className="ops-hero__meter"
              total={providerTotal}
              value={health.data?.readyProviders ?? 0}
            />
          </aside>
        </header>

        <OpsHeroStatRow
          activeProviders={activeProviders.length}
          healthOk={health.data?.ok ?? false}
          raidCount={raids.data?.length ?? 0}
          readyProviders={health.data?.readyProviders ?? 0}
        />

        <X402PaymentsToggle
          disabled={x402TogglePending || opsSettings.isLoading}
          enabled={opsSettings.data?.x402.enabled ?? false}
          error={x402ToggleError}
          settings={opsSettings.data?.x402}
          onToggle={(nextEnabled) => {
            void handleX402Toggle(nextEnabled);
          }}
        />

        <OpsRaidHeroMetrics
          approvedProviderCount={approvedProviders.length}
          payoutPerSuccessfulProvider={raidResult.data?.settlement?.payoutPerSuccessfulProvider}
          raidStatus={raidStatus.data}
          selectedRaid={selectedRaid}
        />

        <section className="ops-mesh-panel flat-section">
          <div className="panel-head">
            <div>
              <p className="eyebrow">mesh</p>
              <h2>Live provider field</h2>
            </div>
            <SignalTag
              blinking={runningState}
              label={runningState ? 'mesh live' : 'mesh idle'}
              variant={runningState ? 'internal' : 'default'}
            />
          </div>
          <ProviderMesh
            experts={raidStatus.data?.experts ?? []}
            providerHealth={providerHealth.data ?? []}
            providers={providers.data ?? []}
          />
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

        <section className="ops-reliability">
          <ProductionReadinessPanel />
          <SettlementStatusPanel />
          <OpsMetricsPanel />
        </section>

        <OpsProviderSidebar
          filteredProviders={filteredProviders}
          providerHealth={providerHealth.data}
          providerQuery={providerQuery}
          onQueryChange={setProviderQuery}
        />
      </main>
    </div>
  );
}
