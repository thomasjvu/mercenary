import type { Provider, ProviderHealth } from '../../api';
import { humanizeStatus } from '../../mercenary-format.js';
import type { LiveRaidRun } from '../../mercenary-result.js';
import { MercenaryOrchestrationPanel } from './MercenaryOrchestrationPanel';
import { ChatMessage, StatusPill, TypingDots } from './mercenary-ui';

type MercenaryRaidProgressProps = {
  lastSubmittedBrief: string | null;
  isLaunching: boolean;
  launchError: string | null;
  liveRaidRun: LiveRaidRun | null;
  activeRaidStatus?: string;
  raidIsTerminal: boolean;
  elapsedLabel: string;
  providers: Provider[];
  providerHealth: ProviderHealth[];
};

export function MercenaryRaidProgress({
  lastSubmittedBrief,
  isLaunching,
  launchError,
  liveRaidRun,
  activeRaidStatus,
  raidIsTerminal,
  elapsedLabel,
  providers,
  providerHealth,
}: MercenaryRaidProgressProps) {
  const submittedAt = liveRaidRun?.startedAtMs
    ? new Date(liveRaidRun.startedAtMs).toISOString()
    : new Date().toISOString();

  return (
    <>
      {lastSubmittedBrief ? (
        <ChatMessage role="user" timestamp={submittedAt}>
          <p>{lastSubmittedBrief}</p>
        </ChatMessage>
      ) : null}

      {isLaunching ? (
        <ChatMessage role="assistant" timestamp={new Date().toISOString()}>
          <p>Reviewing the request and deciding whether to answer directly or open specialists.</p>
          <TypingDots />
        </ChatMessage>
      ) : null}

      {launchError ? (
        <ChatMessage role="assistant" tone="error" timestamp={new Date().toISOString()}>
          <p>I could not start the request.</p>
          <p>{launchError}</p>
        </ChatMessage>
      ) : null}

      {liveRaidRun ? (
        <ChatMessage role="assistant" timestamp={liveRaidRun.lastUpdatedAt}>
          <p>{buildRaidStatusCopy(liveRaidRun)}</p>
          <div className="mercenary-pill-row">
            <StatusPill
              tone={raidIsTerminal ? 'ready' : 'working'}
            >{`status ${humanizeStatus(activeRaidStatus ?? 'queued')}`}</StatusPill>
            <StatusPill tone="available">
              {liveRaidRun.directResponse
                ? 'direct reply'
                : `${liveRaidRun.spawn.selectedExperts} specialists invited`}
            </StatusPill>
            <StatusPill tone="available">{`time ${elapsedLabel}`}</StatusPill>
            {liveRaidRun.spawn.estimatedFirstResultSec > 0 ? (
              <StatusPill tone="available">{`eta ${liveRaidRun.spawn.estimatedFirstResultSec}s`}</StatusPill>
            ) : null}
          </div>
          {liveRaidRun.pollError ? (
            <p className="mercenary-message__note">Last refresh error: {liveRaidRun.pollError}</p>
          ) : null}
        </ChatMessage>
      ) : null}

      {liveRaidRun && !liveRaidRun.directResponse ? (
        <MercenaryOrchestrationPanel
          activeRaidStatus={activeRaidStatus}
          liveRaidRun={liveRaidRun}
          providerHealth={providerHealth}
          providers={providers}
          raidIsTerminal={raidIsTerminal}
        />
      ) : null}
    </>
  );
}

function buildRaidStatusCopy(run: LiveRaidRun): string {
  if (run.directResponse) {
    return 'Mercenary answered directly without opening specialists.';
  }

  const status = run.status?.status ?? run.spawn.status;

  if (status === 'queued') {
    return 'I accepted the request and I’m matching specialists.';
  }

  if (status === 'running') {
    return 'Mercenary is live. I’m collecting scoped specialist output and filtering weak branches.';
  }

  if (status === 'final' && run.result?.synthesizedOutput) {
    return 'Mercenary is final. I merged the strongest specialist outputs into one delivery.';
  }

  if (status === 'final') {
    return 'Mercenary reached a terminal state, but I did not get an approved specialist deliverable for this prompt.';
  }

  return `Mercenary is ${humanizeStatus(status)}.`;
}
