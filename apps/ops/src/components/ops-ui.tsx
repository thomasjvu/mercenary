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

  return (
    <section className="ops-x402-panel flat-section" aria-label="x402 payment controls">
      <div className="ops-x402-panel__copy">
        <p className="eyebrow">payments</p>
        <h2>x402 USDC gate</h2>
        <p className="ops-x402-panel__lede">
          Paid ingress requires explicit confirmation. Buyers on POST /v1/raid and chat routes need
          USDC when enabled.
        </p>
      </div>

      <div className="ops-x402-panel__controls">
        <div className="ops-x402-status">
          <SignalTag
            label={enabled ? 'enabled' : 'disabled'}
            variant={enabled ? 'internal' : 'default'}
          />
          <p className="quiet-note">
            {enabled
              ? 'POST /v1/raid and chat routes require payment.'
              : 'Public ingress stays on free/demo paths.'}
          </p>
        </div>

        <div className="ops-x402-panel__actions">
          {!enabled ? (
            <button
              className="button button--danger"
              disabled={disabled || !canEnable || readinessBlockers.length > 0}
              onClick={onRequestEnable}
              type="button"
            >
              enable paid ingress
            </button>
          ) : (
            <button
              className="button button--danger"
              disabled={disabled}
              onClick={onRequestDisable}
              type="button"
            >
              disable paid ingress
            </button>
          )}
        </div>

        <div className="ops-x402-panel__meta">
          <span>facilitator {settings?.facilitator ?? 'n/a'}</span>
          <span>network {settings?.network ?? 'n/a'}</span>
          <span>asset {settings?.asset ?? 'n/a'}</span>
          <span>
            pay-to{' '}
            {settings?.payToConfigured
              ? settings.payTo
                ? `${settings.payTo.slice(0, 6)}…${settings.payTo.slice(-4)}`
                : 'configured'
              : 'missing'}
          </span>
        </div>

        {readinessBlockers.length > 0 && !enabled ? (
          <ul className="ops-x402-panel__blockers">
            {readinessBlockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        ) : null}
        {blockers.length > 0 ? (
          <ul className="ops-x402-panel__blockers">
            {blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="error-note">{error}</p> : null}
      </div>
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
        <span>final {formatScore(breakdown.finalScore)}</span>
        <span>build {formatScore(breakdown.buildScore)}</span>
        <span>tests {formatScore(breakdown.testScore)}</span>
        <span>latency {formatScore(breakdown.latencyScore)}</span>
      </div>
      <p className="scorecard__summary">{breakdown.summary ?? 'No evaluation summary yet.'}</p>
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
