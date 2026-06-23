import useSWR from 'swr';
import {
  fetchOpsMetrics,
  fetchProductionReadiness,
  fetchSettlementStatus,
  type OpsMetrics,
  type ProductionReadiness,
  type SettlementStatus,
} from '../api';
import { OpsFold, OpsKpiTile, ReadinessMeter, RouteLatencyChart } from './ops-visual';
import { SignalTag } from './ops-ui';

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
    hints.push('See content/docs/reference/payments.md for payout env and ops launch checklist.');
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
  const passCount = report?.checks.filter((check) => check.status === 'pass').length ?? 0;

  return (
    <article className="ops-panel ops-panel--readiness" aria-label="production readiness">
      <div className="panel-head panel-head--compact">
        <div>
          <p className="eyebrow">readiness</p>
          <h3>Launch gate</h3>
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
          <ReadinessMeter
            fail={report.summary.blockingFailures}
            pass={passCount}
            warn={report.summary.warnings}
          />

          <div className="ops-kpi-grid ops-kpi-grid--compact">
            <OpsKpiTile label="checks" value={String(report.summary.checks)} />
            <OpsKpiTile
              label="blocking"
              tone={report.summary.blockingFailures > 0 ? 'danger' : 'good'}
              value={String(report.summary.blockingFailures)}
            />
            <OpsKpiTile
              label="warnings"
              tone={report.summary.warnings > 0 ? 'accent' : 'default'}
              value={String(report.summary.warnings)}
            />
          </div>

          {blockingChecks.length > 0 || warningChecks.length > 0 ? (
            <OpsFold
              count={`${blockingChecks.length + warningChecks.length}`}
              icon="shield"
              title="check details"
            >
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
            </OpsFold>
          ) : null}

          {report.nextActions.length > 0 ? (
            <OpsFold
              count={String(Math.min(report.nextActions.length, 4))}
              icon="launch"
              title="next actions"
            >
              <ul className="ops-readiness-actions-list">
                {report.nextActions.slice(0, 4).map((action) => (
                  <li key={action.check}>
                    <strong>{action.check}</strong>
                    <span>{action.action}</span>
                  </li>
                ))}
              </ul>
            </OpsFold>
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
  const configuredCount = status
    ? [
        status.rpcUrl,
        status.contracts.registry,
        status.contracts.escrow,
        status.contracts.token,
      ].filter(Boolean).length
    : 0;

  return (
    <article className="ops-panel ops-panel--settlement" aria-label="settlement status">
      <div className="panel-head panel-head--compact">
        <div>
          <p className="eyebrow">settlement</p>
          <h3>Payout rail</h3>
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
          <div className="ops-kpi-grid ops-kpi-grid--compact">
            <OpsKpiTile icon="payment" label="mode" value={status.mode} />
            <OpsKpiTile label="chain" value={status.chain?.id ?? 'n/a'} />
            <OpsKpiTile
              icon="shield"
              label="configured"
              meter={(configuredCount / 4) * 100}
              tone={status.configured ? 'good' : 'accent'}
              value={status.configured ? 'yes' : 'no'}
            />
          </div>

          <OpsFold icon="chart" title="rail config">
            <div className="ops-settlement-grid">
              <OpsKpiTile
                label="rpc"
                value={status.rpcUrl ? 'set' : 'missing'}
                tone={status.rpcUrl ? 'good' : 'danger'}
              />
              <OpsKpiTile
                label="registry"
                tone={status.contracts.registry ? 'good' : 'danger'}
                value={status.contracts.registry ? 'set' : 'missing'}
              />
              <OpsKpiTile
                label="escrow"
                tone={status.contracts.escrow ? 'good' : 'danger'}
                value={status.contracts.escrow ? 'set' : 'missing'}
              />
              <OpsKpiTile
                label="token"
                tone={status.contracts.token ? 'good' : 'danger'}
                value={status.contracts.token ? 'set' : 'missing'}
              />
            </div>
          </OpsFold>

          {(() => {
            const runbookHints = buildSettlementRunbookHints(status);
            if (runbookHints.length === 0) {
              return null;
            }

            return (
              <OpsFold count={String(runbookHints.length)} icon="output" title="runbook">
                <ul className="ops-settlement-runbook-list">
                  {runbookHints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
              </OpsFold>
            );
          })()}
        </>
      ) : (
        <p className="quiet-note">Loading settlement health…</p>
      )}
    </article>
  );
}

export function OpsMetricsPanel() {
  const metrics = useSWR<OpsMetrics>('ops-metrics', fetchOpsMetrics, {
    refreshInterval: 15_000,
    revalidateOnFocus: true,
  });

  const snapshot = metrics.data;
  const counterEntries = Object.entries(snapshot?.counters ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, 6);
  const routeEntries = Object.entries(snapshot?.routes ?? {})
    .sort(([, left], [, right]) => right.count - left.count)
    .slice(0, 6)
    .map(([route, stats]) => ({
      route,
      count: stats.count,
      averageLatencyMs: stats.averageLatencyMs,
      errorCount: stats.errorCount,
    }));

  return (
    <article className="ops-panel ops-panel--metrics" aria-label="ops metrics">
      <div className="panel-head panel-head--compact">
        <div>
          <p className="eyebrow">telemetry</p>
          <h3>Route metrics</h3>
        </div>
        <SignalTag blinking label="live" variant="internal" />
      </div>

      {metrics.error ? (
        <p className="error-note">
          {metrics.error instanceof Error ? metrics.error.message : 'Failed to load ops metrics.'}
        </p>
      ) : null}

      {snapshot ? (
        <>
          {routeEntries.length > 0 ? (
            <RouteLatencyChart routes={routeEntries} />
          ) : (
            <p className="quiet-note">No route traffic yet.</p>
          )}

          {counterEntries.length > 0 ? (
            <OpsFold count={String(counterEntries.length)} icon="chart" title="counters">
              <div className="ops-kpi-grid ops-kpi-grid--compact">
                {counterEntries.map(([name, value]) => (
                  <OpsKpiTile
                    key={name}
                    label={name.replaceAll('.', ' / ')}
                    value={String(value)}
                  />
                ))}
              </div>
            </OpsFold>
          ) : null}
        </>
      ) : (
        <p className="quiet-note">Loading metrics…</p>
      )}
    </article>
  );
}
