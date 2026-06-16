import type { ProductionReadiness } from '../api';
import { CONSUMER_LINKS } from '../lib/consumer-urls';
import { resolveOpsSpawnRoute, readSpawnPolicySummary } from '../lib/spawn-routing';
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
      <header className="ops-launch-section__head flat-section">
        <div>
          <p className="eyebrow">launch</p>
          <h2>Internal raid launch</h2>
          <p className="quiet-note">
            Ops launches use the admin session on POST /v1/raid. Buyer wallet flows stay on
            Mercenary.
          </p>
        </div>
        <SignalTag label={routing.route} variant="internal" />
      </header>

      <div className="ops-launch-section__body">
        <OpsSpawnPanel
          spawnError={spawnError}
          spawnPayload={spawnPayload}
          onPayloadChange={onPayloadChange}
        />

        <article className="ops-panel ops-panel--launch-gate">
          <div className="panel-head">
            <div>
              <p className="ops-label">route</p>
              <h3>Launch path</h3>
            </div>
          </div>
          <p className="quiet-note">{routing.reason}</p>
          <div className="ops-launch-meta">
            <span>max agents {policy.maxAgents ?? 'n/a'}</span>
            <span>max budget ${policy.maxTotalCost ?? 'n/a'}</span>
            <span>x402 {x402Enabled ? 'enabled' : 'disabled'}</span>
          </div>

          {blockingChecks.length > 0 ? (
            <ul className="ops-launch-blockers">
              {blockingChecks.slice(0, 4).map((check) => (
                <li key={check.id}>
                  <strong>{check.id}</strong>
                  <span>{check.message}</span>
                </li>
              ))}
            </ul>
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
              launch as buyer
            </a>
            <a
              className="button"
              href={CONSUMER_LINKS.playgroundRaid()}
              rel="noreferrer"
              target="_blank"
            >
              open playground
            </a>
          </div>
        </article>
      </div>
    </section>
  );
}
