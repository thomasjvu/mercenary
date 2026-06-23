import type { ProductionReadiness } from '../api';
import { CONSUMER_LINKS } from '../lib/consumer-urls';
import { resolveOpsSpawnRoute, readSpawnPolicySummary } from '../lib/spawn-routing';
import { OpsFold, OpsKpiTile, OpsSectionHeader } from './ops-visual';
import { OpsSpawnPanel } from './OpsSpawnPanel';
import { SignalTag } from './ops-ui';

type OpsLaunchSectionProps = {
  spawnPayload: string;
  spawnError: string | null;
  spawnPending: boolean;
  x402Enabled: boolean;
  readiness: ProductionReadiness | undefined;
  onPayloadChange: (value: string) => void;
  onRequestLaunch: () => void;
};

export function OpsLaunchSection({
  spawnPayload,
  spawnError,
  spawnPending,
  x402Enabled,
  readiness,
  onPayloadChange,
  onRequestLaunch,
}: OpsLaunchSectionProps) {
  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(spawnPayload) as unknown;
  } catch {
    parsedPayload = null;
  }

  const routing = resolveOpsSpawnRoute();
  const policy = readSpawnPolicySummary(parsedPayload);
  const blockingChecks =
    readiness?.checks.filter((check) => check.status === 'fail' && check.severity === 'blocking') ??
    [];

  return (
    <section className="ops-launch-section" id="launch">
      <OpsSectionHeader
        aside={<SignalTag label={routing.route} variant="internal" />}
        icon="launch"
        title="Raid launch"
      />

      <div className="ops-kpi-grid ops-kpi-grid--compact">
        <OpsKpiTile label="agents" value={String(policy.maxAgents ?? 'n/a')} />
        <OpsKpiTile icon="payment" label="budget" value={`$${policy.maxTotalCost ?? 'n/a'}`} />
        <OpsKpiTile
          icon="payment"
          label="x402"
          tone={x402Enabled ? 'accent' : 'default'}
          value={x402Enabled ? 'on' : 'off'}
        />
        <OpsKpiTile
          label="gate"
          tone={blockingChecks.length > 0 ? 'danger' : 'good'}
          value={blockingChecks.length > 0 ? 'blocked' : 'clear'}
        />
      </div>

      <div className="ops-launch-section__body">
        <OpsSpawnPanel
          spawnError={spawnError}
          spawnPayload={spawnPayload}
          onPayloadChange={onPayloadChange}
        />

        <article className="ops-panel ops-panel--launch-gate">
          <div className="panel-head panel-head--compact">
            <div>
              <p className="eyebrow">route</p>
              <h3>{routing.route}</h3>
            </div>
          </div>
          <p className="quiet-note">{routing.reason}</p>

          {blockingChecks.length > 0 ? (
            <OpsFold count={String(blockingChecks.length)} icon="error" title="blockers">
              <ul className="ops-launch-blockers">
                {blockingChecks.slice(0, 4).map((check) => (
                  <li key={check.id}>
                    <strong>{check.id}</strong>
                    <span>{check.message}</span>
                  </li>
                ))}
              </ul>
            </OpsFold>
          ) : null}

          <div className="ops-launch-actions">
            <button
              className="button button--primary"
              disabled={spawnPending || parsedPayload == null}
              onClick={onRequestLaunch}
              type="button"
            >
              {spawnPending ? 'launching' : 'review & launch'}
            </button>
            <a
              className="button"
              href={CONSUMER_LINKS.mercenary()}
              rel="noreferrer"
              target="_blank"
            >
              buyer launch
            </a>
            <a
              className="button"
              href={CONSUMER_LINKS.playgroundRaid()}
              rel="noreferrer"
              target="_blank"
            >
              playground
            </a>
          </div>
        </article>
      </div>
    </section>
  );
}
