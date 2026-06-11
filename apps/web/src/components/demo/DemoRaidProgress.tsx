import type { DemoRequestMode, LiveRaidRun } from '../../hooks/useRaidDemo';
import { formatTimestamp, humanizeStatus } from '../../hooks/useRaidDemo';
import { ChatMessage, StatusPill, TypingDots } from './demo-ui';

type DemoRaidProgressProps = {
  avatarSrc: string;
  demoMode: DemoRequestMode;
  lastSubmittedBrief: string | null;
  isLaunching: boolean;
  launchError: string | null;
  liveRaidRun: LiveRaidRun | null;
  activeRaidStatus?: string;
  raidIsTerminal: boolean;
  elapsedLabel: string;
};

export function DemoRaidProgress({
  avatarSrc,
  demoMode,
  lastSubmittedBrief,
  isLaunching,
  launchError,
  liveRaidRun,
  activeRaidStatus,
  raidIsTerminal,
  elapsedLabel,
}: DemoRaidProgressProps) {
  return (
    <>
      <ChatMessage avatarSrc={avatarSrc} label="Mercenary" role="assistant">
        <p>
          {demoMode === 'raid'
            ? 'Talk to Mercenary directly here. I’ll answer normally, and if you ask for real scoped work I’ll open a native raid and hire specialists in the background.'
            : 'Talk to Mercenary through the v1 compatibility route here. Simple chat stays direct. Scoped work can still open specialists behind the same API.'}
        </p>
        <p className="mercenary-message__note">
          Mercenary can be wrong, hallucinate, or merge weak specialist output. Verify important
          claims, code, and proofs before you rely on them.
        </p>
      </ChatMessage>

      {lastSubmittedBrief ? (
        <ChatMessage label="You" role="user">
          <p>{lastSubmittedBrief}</p>
        </ChatMessage>
      ) : null}

      {isLaunching ? (
        <ChatMessage avatarSrc={avatarSrc} label="Mercenary" role="assistant">
          <p>
            {demoMode === 'raid'
              ? 'Reviewing the request and opening a native raid.'
              : 'Reviewing the request and running it through /v1/chat/completions.'}
          </p>
          <TypingDots />
        </ChatMessage>
      ) : null}

      {launchError ? (
        <ChatMessage avatarSrc={avatarSrc} label="Mercenary" role="assistant" tone="error">
          <p>I could not start the raid.</p>
          <p>{launchError}</p>
        </ChatMessage>
      ) : null}

      {liveRaidRun ? (
        <ChatMessage avatarSrc={avatarSrc} label="Mercenary" role="assistant">
          <p>{buildRaidStatusCopy(liveRaidRun)}</p>
          <div className="mercenary-pill-row">
            <StatusPill tone="available">{buildDemoModeLabel(liveRaidRun.requestMode)}</StatusPill>
            <StatusPill
              tone={raidIsTerminal ? 'ready' : 'working'}
            >{`status ${humanizeStatus(activeRaidStatus ?? 'queued')}`}</StatusPill>
            <StatusPill tone="available">
              {liveRaidRun.directResponse
                ? 'no raid launched'
                : `${liveRaidRun.spawn.selectedExperts} specialists invited`}
            </StatusPill>
            <StatusPill tone="available">{`time ${elapsedLabel}`}</StatusPill>
            {liveRaidRun.spawn.estimatedFirstResultSec > 0 ? (
              <StatusPill tone="available">{`eta ${liveRaidRun.spawn.estimatedFirstResultSec}s`}</StatusPill>
            ) : null}
          </div>
          <p className="mercenary-message__note">{`Updated ${formatTimestamp(liveRaidRun.lastUpdatedAt)}`}</p>
          {liveRaidRun.pollError ? (
            <p className="mercenary-message__note">Last refresh error: {liveRaidRun.pollError}</p>
          ) : null}
        </ChatMessage>
      ) : null}
    </>
  );
}

function buildDemoModeLabel(mode: DemoRequestMode): string {
  return mode === 'chat_v1' ? 'v1 completions' : 'raid chat';
}

function buildRaidStatusCopy(run: LiveRaidRun): string {
  if (run.directResponse) {
    return 'Mercenary answered directly on the v1 route without opening specialists.';
  }

  const status = run.status?.status ?? run.spawn.status;
  const routeLabel = run.requestMode === 'chat_v1' ? 'v1 chat completion' : 'native raid';

  if (status === 'queued') {
    return `I accepted the request and I’m matching the ${routeLabel} to live specialists.`;
  }

  if (status === 'running') {
    return run.requestMode === 'chat_v1'
      ? 'The v1 completion is live. Mercenary is still opening scoped specialist workstreams behind the compatibility layer.'
      : 'The raid is live. I’m collecting scoped specialist output and filtering weak branches.';
  }

  if (status === 'final' && run.result?.synthesizedOutput) {
    return run.requestMode === 'chat_v1'
      ? 'The v1 completion is final. Mercenary merged the strongest specialist outputs into one clean assistant answer.'
      : 'The raid is final. I merged the strongest specialist outputs into one delivery.';
  }

  if (status === 'final') {
    return run.requestMode === 'chat_v1'
      ? 'The v1 completion reached a terminal state, but Mercenary did not get an approved specialist answer for this prompt.'
      : 'The raid reached a terminal state, but I did not get an approved specialist deliverable for this prompt.';
  }

  return `The ${routeLabel} is ${humanizeStatus(status)}.`;
}
