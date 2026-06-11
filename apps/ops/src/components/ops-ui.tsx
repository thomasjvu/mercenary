import { buildErc8004ProofLabel, hasErc8004Registration, shortValue } from '@bossraid/proof-ui';
import { ArtifactStrip } from '@bossraid/ui';
import type { CSSProperties } from 'react';
import type {
  OpsX402Settings,
  Provider,
  ProviderHealth,
  RaidResult,
  RankedSubmission,
} from '../api';

type RoutingDecision = NonNullable<RaidResult['routingProof']>['providers'][number];

export function formatMs(value?: number): string {
  return value == null ? 'n/a' : `${value} ms`;
}

export function formatUsd(value?: number): string {
  return value == null ? '$0.00' : `$${value.toFixed(2)}`;
}

export function formatScore(value?: number): string {
  return value == null ? '0.00' : value.toFixed(2);
}

export function formatTimestamp(value?: string): string {
  if (!value) {
    return 'n/a';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function countUniqueProviders(
  decisions: RoutingDecision[],
  predicate: (decision: RoutingDecision) => boolean
): number {
  let count = 0;
  const grouped = new Map<string, RoutingDecision[]>();

  for (const decision of decisions) {
    const existing = grouped.get(decision.providerId) ?? [];
    existing.push(decision);
    grouped.set(decision.providerId, existing);
  }

  for (const providerDecisions of grouped.values()) {
    if (providerDecisions.some(predicate)) {
      count += 1;
    }
  }

  return count;
}

export function buildRoutingDecisionSummary(decision: RoutingDecision): string {
  const workstream =
    decision.workstreamLabel && decision.roleLabel
      ? `${decision.workstreamLabel} / ${decision.roleLabel}`
      : (decision.workstreamLabel ?? decision.roleLabel ?? 'root raid');
  const privacySignals = [
    buildErc8004ProofLabel(decision.erc8004VerificationStatus, decision.erc8004Registered),
    decision.registrationTxFound === false ? 'reg tx missing' : null,
    decision.operatorMatchesOwner === false ? 'owner mismatch' : null,
    decision.veniceBacked ? 'venice' : null,
    decision.registrationTx ? `reg ${shortValue(decision.registrationTx)}` : null,
    decision.trustScore > 0 ? `trust ${decision.trustScore}` : null,
    decision.privacyFeatures.includes('no_data_retention') ? 'no-retention' : null,
    decision.privacyFeatures.includes('tee_attested') ? 'tee' : null,
  ].filter((value): value is string => value != null);
  const reasons = decision.reasons
    .filter(
      (reason) => !['selected_primary', 'reserved_fallback', 'workstream_scoped'].includes(reason)
    )
    .map((reason) => reason.replaceAll('_', ' '))
    .join(' / ');

  return [
    `${decision.phase} · ${workstream}`,
    privacySignals.join(' · '),
    reasons ? `why ${reasons}` : null,
  ]
    .filter((value): value is string => value != null && value.length > 0)
    .join(' · ');
}

export function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="receipt-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function X402PaymentsToggle({
  enabled,
  settings,
  disabled,
  error,
  onToggle,
}: {
  enabled: boolean;
  settings?: OpsX402Settings;
  disabled: boolean;
  error: string | null;
  onToggle: (nextEnabled: boolean) => void;
}) {
  const canEnable = settings?.canEnable ?? false;
  const blockedReason =
    !canEnable && !enabled
      ? 'Set BOSSRAID_X402_PAY_TO on the API host before enabling paid routes.'
      : null;

  return (
    <section className="ops-x402-panel" aria-label="x402 payment controls">
      <div className="ops-x402-panel__copy">
        <p className="ops-label">payments</p>
        <h2>x402 USDC gate</h2>
        <p className="ops-x402-panel__lede">
          Paid routes stay off until you flip this switch. Toggle here instead of redeploying env
          vars.
        </p>
      </div>

      <div className="ops-x402-panel__controls">
        <button
          aria-pressed={enabled}
          className={`ops-x402-toggle${enabled ? ' ops-x402-toggle--on' : ''}`}
          disabled={disabled || (!enabled && !canEnable)}
          onClick={() => onToggle(!enabled)}
          type="button"
        >
          <span className="ops-x402-toggle__track" aria-hidden="true">
            <span className="ops-x402-toggle__thumb" />
          </span>
          <span className="ops-x402-toggle__label">
            <strong>{enabled ? 'enabled' : 'disabled'}</strong>
            <span>
              {enabled ? 'POST /v1/raid and chat routes require payment' : 'free ingress'}
            </span>
          </span>
        </button>

        <div className="ops-x402-panel__meta">
          <span>network {settings?.network ?? 'n/a'}</span>
          <span>asset {settings?.asset ?? 'n/a'}</span>
          <span>pay-to {settings?.payToConfigured ? 'configured' : 'missing'}</span>
        </div>

        {blockedReason ? <p className="quiet-note">{blockedReason}</p> : null}
        {error ? <p className="error-note">{error}</p> : null}
      </div>
    </section>
  );
}

export function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-chip">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function SnapshotRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="snapshot-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
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
