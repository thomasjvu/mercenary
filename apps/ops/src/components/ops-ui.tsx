import {
  buildErc8004ProofLabel,
  buildRoutingDecisionSummary,
  countProvidersMatchingSignal,
  formatMs,
  formatScore,
  formatTimestamp,
  formatUsd,
  hasErc8004Registration,
  shortValue,
} from '@bossraid/proof-ui';

export { buildRoutingDecisionSummary, formatMs, formatScore, formatTimestamp, formatUsd };

import { ArtifactStrip } from '@bossraid/ui';
import type { CSSProperties } from 'react';
import { OpsFold, OpsIcon, OpsKpiTile, SegmentBar } from './ops-visual';
import type {
  OpsX402Settings,
  Provider,
  ProviderHealth,
  RaidResult,
  RankedSubmission,
} from '../api';

export function OpsLabelValue({
  label,
  value,
  variant = 'receipt',
}: {
  label: string;
  value: string;
  variant?: 'receipt' | 'stat' | 'metric' | 'snapshot';
}) {
  const className =
    variant === 'stat'
      ? 'stat-chip'
      : variant === 'metric'
        ? 'metric-card'
        : variant === 'snapshot'
          ? 'snapshot-row'
          : 'receipt-card';

  return (
    <div className={className}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ReceiptRow({ label, value }: { label: string; value: string }) {
  return <OpsLabelValue label={label} value={value} variant="receipt" />;
}

export function X402PaymentsGate({
  enabled,
  settings,
  disabled,
  error,
  blockingChecks,
  onRequestEnable,
  onRequestDisable,
}: {
  enabled: boolean;
  settings?: OpsX402Settings;
  disabled: boolean;
  error: string | null;
  blockingChecks: Array<{ id: string; message: string }>;
  onRequestEnable: () => void;
  onRequestDisable: () => void;
}) {
  const canEnable = settings?.canEnable ?? false;
  const blockers =
    settings?.blockers ??
    (!canEnable && !enabled
      ? ['Set BOSSRAID_X402_PAY_TO on the API host before enabling paid routes.']
      : []);
  const readinessBlockers = blockingChecks.map((check) => `${check.id}: ${check.message}`);

  const payToLabel = settings?.payToConfigured
    ? settings.payTo
      ? `${settings.payTo.slice(0, 6)}…${settings.payTo.slice(-4)}`
      : 'set'
    : 'missing';

  return (
    <section className="ops-x402-panel flat-section" aria-label="x402 payment controls">
      <div className="ops-x402-panel__head">
        <div className="ops-x402-panel__title">
          <OpsIcon name="payment" size={20} />
          <div>
            <p className="eyebrow">x402</p>
            <h2>USDC gate</h2>
          </div>
        </div>
        <SignalTag label={enabled ? 'on' : 'off'} variant={enabled ? 'internal' : 'default'} />
      </div>

      <div className="ops-kpi-grid ops-kpi-grid--compact">
        <OpsKpiTile label="network" value={settings?.network ?? 'n/a'} />
        <OpsKpiTile label="asset" value={settings?.asset ?? 'n/a'} />
        <OpsKpiTile
          label="pay-to"
          tone={settings?.payToConfigured ? 'good' : 'danger'}
          value={payToLabel}
        />
        <OpsKpiTile label="facilitator" value={settings?.facilitator ?? 'n/a'} />
      </div>

      <div className="ops-x402-panel__actions">
        {!enabled ? (
          <button
            className="button button--danger"
            disabled={disabled || !canEnable || readinessBlockers.length > 0}
            onClick={onRequestEnable}
            type="button"
          >
            enable
          </button>
        ) : (
          <button
            className="button button--danger"
            disabled={disabled}
            onClick={onRequestDisable}
            type="button"
          >
            disable
          </button>
        )}
      </div>

      {readinessBlockers.length > 0 && !enabled ? (
        <OpsFold count={String(readinessBlockers.length)} icon="error" title="readiness blockers">
          <ul className="ops-x402-panel__blockers">
            {readinessBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </OpsFold>
      ) : null}
      {blockers.length > 0 ? (
        <OpsFold count={String(blockers.length)} icon="warn" title="config blockers">
          <ul className="ops-x402-panel__blockers">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </OpsFold>
      ) : null}
      {error ? <p className="error-note">{error}</p> : null}
    </section>
  );
}

export function StatChip({ label, value }: { label: string; value: string }) {
  return <OpsLabelValue label={label} value={value} variant="stat" />;
}

export function Metric({ label, value }: { label: string; value: string }) {
  return <OpsLabelValue label={label} value={value} variant="metric" />;
}

export function SnapshotRow({ label, value }: { label: string; value: string }) {
  return <OpsLabelValue label={label} value={value} variant="snapshot" />;
}

export function ScoreCard({ entry }: { entry: RankedSubmission }) {
  const breakdown = entry.breakdown;
  const roleLabel = entry.submission.contributionRole?.label;
  const workstreamLabel = entry.submission.contributionRole?.workstreamLabel;
  const contributionLabel =
    workstreamLabel && roleLabel
      ? `${workstreamLabel} / ${roleLabel}`
      : (workstreamLabel ?? roleLabel);

  return (
    <article className="scorecard">
      <div className="scorecard__head">
        <div>
          <span className="ops-label">rank {entry.rank}</span>
          <h3>{entry.submission.providerId}</h3>
          {contributionLabel ? <p className="quiet-note">{contributionLabel}</p> : null}
        </div>
        <SignalTag
          label={breakdown.valid ? 'approved' : 'rejected'}
          variant={breakdown.valid ? 'default' : 'danger'}
        />
      </div>
      <div className="scorecard__metrics">
        <div className="scorecard__metric-row">
          <span>final</span>
          <SegmentBar segments={12} tone="market" value={breakdown.finalScore} />
          <strong>{formatScore(breakdown.finalScore)}</strong>
        </div>
        <div className="scorecard__metric-row">
          <span>build</span>
          <SegmentBar segments={12} tone="volume" value={breakdown.buildScore} />
          <strong>{formatScore(breakdown.buildScore)}</strong>
        </div>
        <div className="scorecard__metric-row">
          <span>tests</span>
          <SegmentBar segments={12} tone="ref" value={breakdown.testScore} />
          <strong>{formatScore(breakdown.testScore)}</strong>
        </div>
        <div className="scorecard__metric-row">
          <span>latency</span>
          <SegmentBar segments={12} tone="savings" value={breakdown.latencyScore} />
          <strong>{formatScore(breakdown.latencyScore)}</strong>
        </div>
      </div>
      {breakdown.summary ? (
        <details className="ops-fold">
          <summary className="ops-fold__summary">
            <span className="ops-fold__title">
              <span>summary</span>
            </span>
          </summary>
          <div className="ops-fold__body">
            <p className="scorecard__summary">{breakdown.summary}</p>
          </div>
        </details>
      ) : null}
      {entry.submission.artifacts?.length ? (
        <ArtifactStrip artifacts={entry.submission.artifacts} compact />
      ) : null}
      {breakdown.invalidReasons?.length ? (
        <div className="scorecard__issues">
          {breakdown.invalidReasons.map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function WorkstreamCard({
  workstream,
}: {
  workstream: NonNullable<RaidResult['synthesizedOutput']>['workstreams'][number];
}) {
  return (
    <article className="scorecard">
      <div className="scorecard__head">
        <div>
          <span className="ops-label">workstream</span>
          <h3>{workstream.label}</h3>
          <p className="quiet-note">{workstream.roleLabels.join(' / ') || workstream.objective}</p>
        </div>
        <SignalTag
          label={`${workstream.contributingProviderIds.length} providers`}
          variant="internal"
        />
      </div>
      <p className="scorecard__summary">{workstream.summary}</p>
      {workstream.artifacts?.length ? (
        <ArtifactStrip artifacts={workstream.artifacts} compact />
      ) : null}
    </article>
  );
}

export function ProviderRow({
  provider,
  health,
}: {
  provider: Provider;
  health: ProviderHealth | undefined;
}) {
  const readyState = health?.ready ? 'ready' : health?.reachable ? 'warm' : 'down';
  const erc8004Label = buildErc8004ProofLabel(
    provider.erc8004?.verification?.status,
    hasErc8004Registration(provider)
  );

  return (
    <div className="provider-row">
      <div className="provider-row__main">
        <strong>{provider.displayName}</strong>
        <span>
          {provider.modelFamily ?? 'unknown'} · {provider.outputTypes?.join(' / ') || 'n/a'} ·{' '}
          {erc8004Label}
        </span>
      </div>
      <div className="provider-row__scores">
        <span>rep {provider.scores?.reputationScore ?? 0}</span>
        <span>priv {provider.scores?.privacyScore ?? 0}</span>
        <span>trust {provider.trust?.score ?? 0}</span>
        <span className={`status-dot status-dot--${readyState}`}>{readyState}</span>
      </div>
    </div>
  );
}

export function SignalTag({
  label,
  variant,
  blinking = false,
}: {
  label: string;
  variant: 'default' | 'danger' | 'internal';
  blinking?: boolean;
}) {
  return (
    <span className={`signal-tag signal-tag--${variant} ${blinking ? 'signal-tag--blink' : ''}`}>
      {label}
    </span>
  );
}

export function SignalMeter({
  value,
  total,
  className,
}: {
  value: number;
  total: number;
  className?: string;
}) {
  const segments = Math.max(total, 6);
  const filled = Math.min(value, segments);

  return (
    <div className={className ? `signal-meter ${className}` : 'signal-meter'}>
      <div className="signal-meter__bars" aria-hidden="true">
        {Array.from({ length: segments }).map((_, index) => (
          <span
            className={`signal-meter__bar ${index < filled ? 'signal-meter__bar--on' : ''}`}
            key={index}
            style={{ '--meter-index': index } as CSSProperties}
          />
        ))}
      </div>
      <div className="signal-meter__meta">
        <span>ready mesh</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
