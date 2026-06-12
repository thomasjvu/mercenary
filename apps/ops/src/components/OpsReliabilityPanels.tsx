import useSWR from 'swr';
import {
  fetchOpsMetrics,
  fetchProductionReadiness,
  fetchSettlementStatus,
  type OpsMetrics,
  type ProductionReadiness,
  type SettlementStatus,
} from '../api';
import { Metric, SignalTag } from './ops-ui';

function buildSettlementRunbookHints(status: SettlementStatus): string[] {
  const hints: string[] = [];

  if (status.mode === 'off') {
    hints.push(
      'BOSSRAID_SETTLEMENT_MODE=off disables payout proofs. Set file or onchain before launch.'
    );
    return hints;
  }

  if (status.mode === 'file') {
    hints.push('File mode writes ERC-8183 settlement artifacts under BOSSRAID_SETTLEMENT_DIR.');
    hints.push('Manual finalize: pnpm --filter @bossraid/orchestrator settle -- --latest-final');
  }

  if (status.mode === 'onchain') {
    if (!status.configured) {
      if (!status.rpcUrl) {
        hints.push('Set BOSSRAID_RPC_URL for chain access.');
      }
      if (!status.contracts.registry) {
        hints.push('Set BOSSRAID_REGISTRY_ADDRESS for ERC-8004 registry calls.');
      }
      if (!status.contracts.escrow) {
        hints.push('Set BOSSRAID_ESCROW_ADDRESS for escrow funding and payouts.');
      }
      if (!status.contracts.token) {
        hints.push('Set BOSSRAID_TOKEN_ADDRESS when settlement uses an ERC-20 payout token.');
      }
      hints.push(
        'Treasury signer: BOSSRAID_SETTLEMENT_TREASURY_KEY or BOSSRAID_CLIENT_PRIVATE_KEY.'
      );
      return hints;
    }

    hints.push(
      'Onchain settlement is configured. Enable BOSSRAID_SETTLEMENT_FUND_JOBS to escrow child jobs automatically.'
    );
    hints.push(
      'Evaluator signer: BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY must match BOSSRAID_EVALUATOR_ADDRESS.'
    );
    hints.push('See docs/reference/payments.md for payout env and ops launch checklist.');
  }

  return hints;
}

function readinessVariant(status: ProductionReadiness['checks'][number]['status']) {
  if (status === 'pass') {
    return 'default' as const;
  }
  if (status === 'warn') {
    return 'internal' as const;
  }
  return 'danger' as const;
}

export function ProductionReadinessPanel() {
  const readiness = useSWR<ProductionReadiness>(
    'ops-production-readiness',
    fetchProductionReadiness,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
    }
  );

  const report = readiness.data;
  const blockingChecks =
    report?.checks.filter((check) => check.status === 'fail' && check.severity === 'blocking') ??
    [];
  const warningChecks = report?.checks.filter((check) => check.status === 'warn') ?? [];

  return (
    <article className="ops-panel ops-panel--readiness" aria-label="production readiness">
      <div className="panel-head">
        <div>
          <p className="ops-label">launch gate</p>
          <h3>Production readiness</h3>
        </div>
        <SignalTag
          label={report ? (report.ok ? 'ready' : 'blocked') : 'loading'}
          variant={report?.ok ? 'default' : 'danger'}
        />
      </div>

      {readiness.error ? (
        <p className="error-note">
          {readiness.error instanceof Error
            ? readiness.error.message
            : 'Failed to load production readiness.'}
        </p>
      ) : null}

      {report ? (
        <>
          <div className="ops-readiness-summary">
            <Metric label="checks" value={String(report.summary.checks)} />
            <Metric label="blocking" value={String(report.summary.blockingFailures)} />
            <Metric label="warnings" value={String(report.summary.warnings)} />
          </div>

          <ul className="ops-readiness-list">
            {blockingChecks.map((check) => (
              <li className="ops-readiness-item" key={check.id}>
                <div className="ops-readiness-item__head">
                  <strong>{check.id}</strong>
                  <SignalTag label={check.status} variant={readinessVariant(check.status)} />
                </div>
                <p>{check.message}</p>
              </li>
            ))}
            {warningChecks.map((check) => (
              <li className="ops-readiness-item" key={check.id}>
                <div className="ops-readiness-item__head">
                  <strong>{check.id}</strong>
                  <SignalTag label={check.status} variant={readinessVariant(check.status)} />
                </div>
                <p>{check.message}</p>
              </li>
            ))}
          </ul>

          {report.nextActions.length > 0 ? (
            <div className="ops-readiness-actions">
              <p className="ops-label">next actions</p>
              <ul>
                {report.nextActions.slice(0, 4).map((action) => (
                  <li key={action.check}>
                    <strong>{action.check}</strong>
                    <span>{action.action}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="quiet-note">Loading launch checklist…</p>
      )}
    </article>
  );
}

export function SettlementStatusPanel() {
  const settlement = useSWR<SettlementStatus>('ops-settlement-status', fetchSettlementStatus, {
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });

  const status = settlement.data;

  return (
    <article className="ops-panel ops-panel--settlement" aria-label="settlement status">
      <div className="panel-head">
        <div>
          <p className="ops-label">payout rail</p>
          <h3>Settlement status</h3>
        </div>
        <SignalTag
          label={status ? (status.configured ? 'configured' : 'incomplete') : 'loading'}
          variant={status?.configured ? 'default' : 'internal'}
        />
      </div>

      {settlement.error ? (
        <p className="error-note">
          {settlement.error instanceof Error
            ? settlement.error.message
            : 'Failed to load settlement status.'}
        </p>
      ) : null}

      {status ? (
        <>
          <div className="ops-settlement-grid">
            <Metric label="mode" value={status.mode} />
            <Metric label="chain" value={status.chain?.id ?? 'n/a'} />
            <Metric label="rpc" value={status.rpcUrl ?? 'n/a'} />
            <Metric label="registry" value={status.contracts.registry ? 'set' : 'missing'} />
            <Metric label="escrow" value={status.contracts.escrow ? 'set' : 'missing'} />
            <Metric label="token" value={status.contracts.token ? 'set' : 'missing'} />
          </div>

          {(() => {
            const runbookHints = buildSettlementRunbookHints(status);
            if (runbookHints.length === 0) {
              return null;
            }

            return (
              <div className="ops-settlement-runbook">
                <p className="ops-label">runbook</p>
                <ul>
                  {runbookHints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              </div>
            );
          })()}
        </>
      ) : (
        <p className="quiet-note">Loading settlement health…</p>
      )}
    </article>
  );
}

function formatCounterLabel(name: string): string {
  return name.replaceAll('.', ' / ');
}

export function OpsMetricsPanel() {
  const metrics = useSWR<OpsMetrics>('ops-metrics', fetchOpsMetrics, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });

  const snapshot = metrics.data;
  const counterEntries = Object.entries(snapshot?.counters ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 8);
  const routeEntries = Object.entries(snapshot?.routes ?? {})
    .sort(([, left], [, right]) => right.count - left.count)
    .slice(0, 6);

  return (
    <article className="ops-panel ops-panel--metrics" aria-label="ops metrics">
      <div className="panel-head">
        <div>
          <p className="ops-label">telemetry</p>
          <h3>Ops metrics</h3>
        </div>
        <SignalTag label="live" variant="internal" blinking />
      </div>

      {metrics.error ? (
        <p className="error-note">
          {metrics.error instanceof Error ? metrics.error.message : 'Failed to load ops metrics.'}
        </p>
      ) : null}

      {snapshot ? (
        <>
          <div className="ops-metrics-counters">
            {counterEntries.map(([name, value]) => (
              <Metric key={name} label={formatCounterLabel(name)} value={String(value)} />
            ))}
          </div>

          {routeEntries.length > 0 ? (
            <div className="ops-metrics-routes">
              <p className="ops-label">top routes</p>
              <ul>
                {routeEntries.map(([route, stats]) => (
                  <li key={route}>
                    <strong>{route}</strong>
                    <span>
                      {stats.count} req · {Math.round(stats.averageLatencyMs)}ms avg
                      {stats.errorCount > 0 ? ` · ${stats.errorCount} err` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="quiet-note">Loading JSON metrics…</p>
      )}
    </article>
  );
}
