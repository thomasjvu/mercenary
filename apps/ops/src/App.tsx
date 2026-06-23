import { startTransition, useDeferredValue, useEffect, useState } from 'react';
import { DocsButton, ProviderMesh, useRaidPolling } from '@bossraid/ui';
import useSWR from 'swr';
import {
  createOpsSession,
  deleteOpsSession,
  fetchJson,
  fetchOpsSessionStatus,
  fetchOpsSettings,
  fetchProductionReadiness,
  fetchReady,
  spawnOpsRaid,
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
import { OpsConfirmDialog } from './components/OpsConfirmDialog';
import { OpsConsumerLinks } from './components/OpsConsumerLinks';
import { OpsLaunchSection } from './components/OpsLaunchSection';
import { OpsPlatformSection } from './components/OpsPlatformSection';
import { OpsProviderSidebar } from './components/OpsProviderSidebar';
import { OpsHeroStatRow, OpsRaidDetail, OpsRaidHeroMetrics } from './components/OpsRaidDetail';
import {
  OpsSectionNav,
  readOpsSectionFromHash,
  writeOpsSectionHash,
  type OpsSectionId,
} from './components/OpsSectionNav';
import { OpsSectionHeader } from './components/ops-visual';
import { SignalTag } from './components/ops-ui';
import { DEFAULT_SPAWN_PAYLOAD } from './default-payload';
import { CONSUMER_LINKS } from './lib/consumer-urls';
import { readRaidReceipt, rememberRaidReceipt } from './lib/raid-receipt-store';
import { readSpawnPolicySummary } from './lib/spawn-routing';

type OpsTheme = 'light' | 'dark';

type PendingConfirm =
  | { kind: 'launch' }
  | { kind: 'abort' }
  | { kind: 'replay' }
  | { kind: 'x402-enable' }
  | { kind: 'x402-disable' }
  | null;

function readStoredOpsTheme(): OpsTheme {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const stored = window.localStorage.getItem('bossraid-ops-theme');
  return stored === 'dark' ? 'dark' : 'light';
}

export function App() {
  const [appTheme, setAppTheme] = useState<OpsTheme>(readStoredOpsTheme);
  const [activeSection, setActiveSection] = useState<OpsSectionId>(readOpsSectionFromHash);
  const [adminTokenInput, setAdminTokenInput] = useState('');
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [raidId, setRaidId] = useState<string | null>(null);
  const [spawnPending, setSpawnPending] = useState(false);
  const [actionPending, setActionPending] = useState<'abort' | 'replay' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [receiptCopied, setReceiptCopied] = useState(false);
  const [providerQuery, setProviderQuery] = useState('');
  const [spawnPayload, setSpawnPayload] = useState(DEFAULT_SPAWN_PAYLOAD);
  const [spawnError, setSpawnError] = useState<string | null>(null);
  const [x402TogglePending, setX402TogglePending] = useState(false);
  const [x402ToggleError, setX402ToggleError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
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
  const readiness = useSWR(opsReady ? 'ops-production-readiness' : null, fetchProductionReadiness, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });
  const buyerReady = useSWR(opsReady ? 'ops-buyer-ready' : null, fetchReady, {
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
    function handleHashChange() {
      setActiveSection(readOpsSectionFromHash());
    }

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (!receiptCopied) {
      return;
    }

    const timer = window.setTimeout(() => setReceiptCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [receiptCopied]);

  function handleSectionChange(section: OpsSectionId) {
    setActiveSection(section);
    writeOpsSectionHash(section);
  }

  async function handleSpawnRaid() {
    setSpawnPending(true);
    setSpawnError(null);
    setConfirmError(null);

    try {
      const payload = JSON.parse(spawnPayload) as unknown;
      const spawn = await spawnOpsRaid(payload);
      rememberRaidReceipt({
        raidId: spawn.raidId,
        raidAccessToken: spawn.raidAccessToken,
        receiptPath: spawn.receiptPath,
      });
      startTransition(() => {
        setRaidId(spawn.raidId);
        setActiveSection('live');
        writeOpsSectionHash('live');
      });
      await Promise.all([raids.mutate(), raidStatus.mutate(), raidResult.mutate()]);
      setPendingConfirm(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Launch failed.';
      setSpawnError(message);
      setConfirmError(message);
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
    setConfirmError(null);

    try {
      const settings = await updateOpsX402Enabled(nextEnabled);
      await Promise.all([opsSettings.mutate(settings, false), buyerReady.mutate()]);
      setPendingConfirm(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update x402 setting.';
      setX402ToggleError(message);
      setConfirmError(message);
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
    setActionError(null);
    setConfirmError(null);

    try {
      await fetchJson(`/v1/raid/${raidId}/abort`, { method: 'POST' });
      await Promise.all([raidStatus.mutate(), raidResult.mutate(), raids.mutate()]);
      setPendingConfirm(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Abort failed.';
      setActionError(message);
      setConfirmError(message);
    } finally {
      setActionPending(null);
    }
  }

  async function handleReplayEvaluation() {
    if (!raidId) {
      return;
    }
    setActionPending('replay');
    setActionError(null);
    setConfirmError(null);

    try {
      await fetchJson(`/v1/evaluations/${raidId}/replay`, { method: 'POST' });
      await Promise.all([raidStatus.mutate(), raidResult.mutate(), raids.mutate()]);
      setPendingConfirm(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Replay failed.';
      setActionError(message);
      setConfirmError(message);
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

  function closeConfirm() {
    if (spawnPending || actionPending || x402TogglePending) {
      return;
    }
    setPendingConfirm(null);
    setConfirmError(null);
  }

  function confirmDialogProps():
    | {
        open: true;
        title: string;
        description: string;
        confirmLabel: string;
        severity: 'warning' | 'danger';
        requireTypedPhrase?: string;
        details?: string[];
        pending: boolean;
        error: string | null;
        onConfirm: () => void;
      }
    | { open: false } {
    if (!pendingConfirm) {
      return { open: false };
    }

    const x402Enabled = opsSettings.data?.x402.enabled ?? false;
    const blockingChecks =
      readiness.data?.checks.filter(
        (check) => check.status === 'fail' && check.severity === 'blocking'
      ) ?? [];

    if (pendingConfirm.kind === 'launch') {
      let parsedPayload: unknown;
      try {
        parsedPayload = JSON.parse(spawnPayload) as unknown;
      } catch {
        parsedPayload = null;
      }
      const policy = readSpawnPolicySummary(parsedPayload);

      return {
        open: true,
        title: 'Launch internal raid',
        description:
          'This uses the admin session, not a buyer wallet. Mercenary remains the paid buyer path when x402 is enabled.',
        confirmLabel: 'launch raid',
        severity: 'warning',
        details: [
          `max agents ${policy.maxAgents ?? 'n/a'}`,
          `max budget $${policy.maxTotalCost ?? 'n/a'}`,
          `x402 ${x402Enabled ? 'enabled' : 'disabled'}`,
        ],
        pending: spawnPending,
        error: confirmError,
        onConfirm: () => void handleSpawnRaid(),
      };
    }

    if (pendingConfirm.kind === 'abort') {
      return {
        open: true,
        title: 'Abort raid',
        description: `Providers will stop work on ${raidId ?? 'this raid'}. Status moves to cancelled.`,
        confirmLabel: 'abort raid',
        severity: 'danger',
        details: [`status ${raidStatus.data?.status ?? selectedRaid?.status ?? 'unknown'}`],
        pending: actionPending === 'abort',
        error: confirmError ?? actionError,
        onConfirm: () => void handleAbortRaid(),
      };
    }

    if (pendingConfirm.kind === 'replay') {
      return {
        open: true,
        title: 'Re-score raid',
        description: 'Replay evaluation on this finalized raid and refresh ranked submissions.',
        confirmLabel: 're-score',
        severity: 'warning',
        pending: actionPending === 'replay',
        error: confirmError ?? actionError,
        onConfirm: () => void handleReplayEvaluation(),
      };
    }

    if (pendingConfirm.kind === 'x402-enable') {
      return {
        open: true,
        title: 'Enable paid ingress',
        description:
          'Buyers hitting POST /v1/raid and chat routes will need USDC via x402. Free demo paths stay separate.',
        confirmLabel: 'enable x402',
        severity: 'danger',
        details: blockingChecks.map((check) => `${check.id}: ${check.message}`),
        pending: x402TogglePending,
        error: confirmError ?? x402ToggleError,
        onConfirm: () => void handleX402Toggle(true),
      };
    }

    return {
      open: true,
      title: 'Disable paid ingress',
      description: 'Public ingress returns to free/demo paths until x402 is enabled again.',
      confirmLabel: 'disable x402',
      severity: 'warning',
      requireTypedPhrase: 'DISABLE',
      pending: x402TogglePending,
      error: confirmError ?? x402ToggleError,
      onConfirm: () => void handleX402Toggle(false),
    };
  }

  const selectedRaid = (raids.data ?? []).find((raid) => raid.raidId === raidId) ?? raids.data?.[0];
  const storedReceipt = readRaidReceipt(raidId);
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
  const dialogProps = confirmDialogProps();
  const x402Enabled = opsSettings.data?.x402.enabled ?? false;

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
      <header className="ops-topbar">
        <div className="ops-topbar__brand">
          <strong>Boss Raid Ops</strong>
          <span>mercenary-v1 / control plane</span>
        </div>
        <div className="ops-topbar__actions">
          <a
            className="ops-public-link button"
            href={CONSUMER_LINKS.publicApp()}
            rel="noreferrer"
            target="_blank"
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
        <OpsSectionNav activeSection={activeSection} onSelect={handleSectionChange} />

        {activeSection === 'live' ? (
          <section className="ops-section" id="live">
            <OpsSectionHeader
              aside={
                <SignalTag
                  blinking={runningState}
                  label={runningState ? 'live' : 'idle'}
                  variant={runningState ? 'internal' : 'default'}
                />
              }
              icon="live"
              title="Live raid"
            />

            <OpsHeroStatRow
              activeProviders={activeProviders.length}
              healthOk={health.data?.ok ?? false}
              raidCount={raids.data?.length ?? 0}
              readyProviders={health.data?.readyProviders ?? 0}
            />

            <OpsConsumerLinks
              buyerPaymentEnabled={buyerReady.data?.payment.enabled ?? null}
              opsX402Enabled={x402Enabled}
              receiptQuery={
                raidId && storedReceipt?.raidAccessToken
                  ? { raidId, token: storedReceipt.raidAccessToken }
                  : null
              }
            />

            <OpsRaidHeroMetrics
              approvedProviderCount={approvedProviders.length}
              payoutPerSuccessfulProvider={raidResult.data?.settlement?.payoutPerSuccessfulProvider}
              raidStatus={raidStatus.data}
              selectedRaid={selectedRaid}
            />

            <section className="ops-mesh-panel flat-section">
              <div className="panel-head panel-head--compact">
                <div>
                  <p className="eyebrow">mesh</p>
                  <h2>Provider field</h2>
                </div>
                <span className="quiet-note">
                  {health.data?.readyProviders ?? 0}/{providerTotal} ready
                </span>
              </div>
              <ProviderMesh
                experts={raidStatus.data?.experts ?? []}
                providerHealth={providerHealth.data ?? []}
                providers={providers.data ?? []}
              />
            </section>

            <OpsRaidDetail
              actionError={actionError}
              actionPending={actionPending}
              activeRaidId={activeRaidId}
              approvedProviders={approvedProviders}
              buyerReceiptToken={storedReceipt?.raidAccessToken ?? null}
              canAbort={Boolean(canAbort)}
              canReplay={Boolean(canReplay)}
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
              synthesizedArtifacts={synthesizedArtifacts}
              synthesizedOutput={synthesizedOutput}
              synthesizedWorkstreams={synthesizedWorkstreams}
              onCopyReceipt={() => void handleCopyReceipt()}
              onRequestAbort={() => {
                setConfirmError(null);
                setPendingConfirm({ kind: 'abort' });
              }}
              onRequestReplay={() => {
                setConfirmError(null);
                setPendingConfirm({ kind: 'replay' });
              }}
              onSelectRaid={setRaidId}
            />
          </section>
        ) : null}

        {activeSection === 'launch' ? (
          <OpsLaunchSection
            readiness={readiness.data}
            spawnError={spawnError}
            spawnPayload={spawnPayload}
            spawnPending={spawnPending}
            x402Enabled={x402Enabled}
            onPayloadChange={setSpawnPayload}
            onRequestLaunch={() => {
              setConfirmError(null);
              setPendingConfirm({ kind: 'launch' });
            }}
          />
        ) : null}

        {activeSection === 'platform' ? (
          <OpsPlatformSection
            readiness={readiness.data}
            settings={opsSettings.data?.x402}
            settingsLoading={opsSettings.isLoading}
            toggleError={x402ToggleError}
            togglePending={x402TogglePending}
            onRequestDisable={() => {
              setConfirmError(null);
              setPendingConfirm({ kind: 'x402-disable' });
            }}
            onRequestEnable={() => {
              setConfirmError(null);
              setPendingConfirm({ kind: 'x402-enable' });
            }}
          />
        ) : null}

        {activeSection === 'providers' ? (
          <section className="ops-section" id="providers">
            <OpsSectionHeader icon="providers" title="Provider registry" />
            <OpsProviderSidebar
              filteredProviders={filteredProviders}
              providerHealth={providerHealth.data}
              providerQuery={providerQuery}
              onQueryChange={setProviderQuery}
            />
          </section>
        ) : null}
      </main>

      {dialogProps.open ? (
        <OpsConfirmDialog
          cancelLabel="cancel"
          confirmLabel={dialogProps.confirmLabel}
          description={dialogProps.description}
          details={dialogProps.details}
          error={dialogProps.error}
          open
          pending={dialogProps.pending}
          requireTypedPhrase={dialogProps.requireTypedPhrase}
          severity={dialogProps.severity}
          title={dialogProps.title}
          onCancel={closeConfirm}
          onConfirm={dialogProps.onConfirm}
        />
      ) : null}
    </div>
  );
}
