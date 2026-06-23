import { ProviderMesh } from '@bossraid/ui';
import type { Provider, ProviderHealth } from '../../api';
import { formatLatency, humanizeStatus } from '../../mercenary-format.js';
import type { LiveRaidRun } from '../../mercenary-result.js';
import { SpecialistProgressMeter, StatusPill, type SpecialistTone } from './mercenary-ui';

type MercenaryOrchestrationPanelProps = {
  liveRaidRun: LiveRaidRun;
  providers: Provider[];
  providerHealth: ProviderHealth[];
  raidIsTerminal: boolean;
  activeRaidStatus?: string;
};

function expertTone(status: string | undefined): SpecialistTone {
  if (!status) {
    return 'offline';
  }
  if (['running', 'accepted', 'submitted', 'evaluating'].includes(status)) {
    return 'working';
  }
  if (['invited', 'selected', 'queued'].includes(status)) {
    return 'available';
  }
  if (['final', 'first_valid', 'paid'].includes(status)) {
    return 'ready';
  }
  return 'offline';
}

function progressFromExpert(status: string | undefined, progress?: number): number {
  if (typeof progress === 'number' && Number.isFinite(progress)) {
    return Math.max(0, Math.min(1, progress));
  }
  if (status === 'submitted' || status === 'paid') {
    return 1;
  }
  if (status === 'running') {
    return 0.72;
  }
  if (status === 'accepted') {
    return 0.42;
  }
  if (status === 'invited' || status === 'selected') {
    return 0.18;
  }
  return 0.08;
}

export function MercenaryOrchestrationPanel({
  liveRaidRun,
  providers,
  providerHealth,
  raidIsTerminal,
  activeRaidStatus,
}: MercenaryOrchestrationPanelProps) {
  if (liveRaidRun.directResponse) {
    return null;
  }

  const experts = liveRaidRun.status?.experts ?? [];
  const decisions = liveRaidRun.agentLog?.decisions ?? [];
  const routingProof = liveRaidRun.result?.routingProof;
  const routedCount = routingProof?.providers?.length ?? 0;
  const armedCount = experts.filter(
    (expert) => expert.status && !['timed_out', 'failed', 'invalid'].includes(expert.status)
  ).length;

  const meshProviders = providers.slice(0, 15);

  return (
    <section
      aria-label="Live raid orchestration"
      className={`mercenary-orchestration${raidIsTerminal ? ' mercenary-orchestration--terminal' : ''}`}
    >
      <header className="mercenary-orchestration__head">
        <div>
          <p className="mercenary-orchestration__eyebrow">orchestration</p>
          <h3>Live mesh</h3>
        </div>
        <div className="mercenary-orchestration__chips">
          <StatusPill tone={raidIsTerminal ? 'ready' : 'working'}>
            {humanizeStatus(activeRaidStatus ?? 'running')}
          </StatusPill>
          <span className="mercenary-orchestration__chip">{armedCount} armed</span>
          {routedCount > 0 ? (
            <span className="mercenary-orchestration__chip">{routedCount} routed</span>
          ) : null}
        </div>
      </header>

      <div className="mercenary-orchestration__mesh">
        <ProviderMesh experts={experts} providerHealth={providerHealth} providers={meshProviders} />
      </div>

      {experts.length > 0 ? (
        <div className="mercenary-orchestration__experts">
          {experts.slice(0, 6).map((expert) => {
            const provider = providers.find((entry) => entry.providerId === expert.providerId);
            const tone = expertTone(expert.status);
            const progress = progressFromExpert(expert.status, expert.progress);

            return (
              <article className="mercenary-orchestration__expert" key={expert.providerId}>
                <div className="mercenary-orchestration__expert-head">
                  <strong>{provider?.displayName ?? expert.providerId}</strong>
                  <StatusPill tone={tone}>{humanizeStatus(expert.status ?? 'queued')}</StatusPill>
                </div>
                <SpecialistProgressMeter progressValue={progress} tone={tone} />
                <div className="mercenary-orchestration__expert-meta">
                  {formatLatency(expert.latencyMs) ? (
                    <span>{formatLatency(expert.latencyMs)}</span>
                  ) : null}
                  {expert.message ? <span>{expert.message}</span> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {decisions.length > 0 ? (
        <ol className="mercenary-orchestration__trace">
          {decisions.slice(0, 6).map((decision, index) => (
            <li
              className={`mercenary-orchestration__trace-step mercenary-orchestration__trace-step--${decision.status}`}
              key={`${decision.type}:${decision.at}:${index}`}
            >
              <span className="mercenary-orchestration__trace-index">{index + 1}</span>
              <div className="mercenary-orchestration__trace-copy">
                <strong>{humanizeStatus(decision.type)}</strong>
                <p>{decision.summary}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
