import type { RaidAgentLog } from '../../api';
import {
  buildAgentLogPath,
  formatTimestamp,
  humanizeStatus,
  type ConversationSpecialistRecord,
  type LiveRaidRun,
  type SpecialistTraceRecord,
} from '../../hooks/useRaidDemo';
import type { MercenaryThreadRecord } from '../../lib/mercenary-threads.js';
import { MercenaryAgentCard } from './MercenaryAgentCard.js';
import { MercenaryThreadList } from './MercenaryThreadList.js';
import { SpecialistProgressMeter, StatusPill } from './demo-ui';

type DemoRaidSidebarProps = {
  liveRaidRun: LiveRaidRun | null;
  raidIsTerminal: boolean;
  activeRaidStatus?: string;
  canLaunchLiveRaid: boolean;
  showReceiptLinks: boolean;
  showTraceLink: boolean;
  receiptCopied: boolean;
  onCopyReceiptLink: () => void;
  runtimeAttestationTone: 'ready' | 'available' | 'offline' | 'working';
  runtimeAttestationStatus: string;
  highlightedSidebarSpecialists: ConversationSpecialistRecord[];
  showTracePanel: boolean;
  traceEventCount: number;
  mercenaryDecisionTrace: RaidAgentLog['decisions'];
  specialistTraces: SpecialistTraceRecord[];
  showThreadList?: boolean;
  threads?: MercenaryThreadRecord[];
  activeThreadId?: string;
  onSelectThread?: (threadId: string) => void;
  onNewThread?: () => void;
  onRenameThread?: (threadId: string, title: string) => void;
  onDeleteThread?: (threadId: string) => void;
};

export function DemoRaidSidebar({
  liveRaidRun,
  raidIsTerminal,
  activeRaidStatus,
  canLaunchLiveRaid,
  showReceiptLinks,
  showTraceLink,
  receiptCopied,
  onCopyReceiptLink,
  runtimeAttestationTone,
  runtimeAttestationStatus,
  highlightedSidebarSpecialists,
  showTracePanel,
  traceEventCount,
  mercenaryDecisionTrace,
  specialistTraces,
  showThreadList = false,
  threads = [],
  activeThreadId,
  onSelectThread,
  onNewThread,
  onRenameThread,
  onDeleteThread,
}: DemoRaidSidebarProps) {
  const runTone = liveRaidRun
    ? raidIsTerminal
      ? 'ready'
      : 'working'
    : canLaunchLiveRaid
      ? 'ready'
      : 'offline';
  const runLabel = liveRaidRun
    ? humanizeStatus(activeRaidStatus ?? 'queued')
    : canLaunchLiveRaid
      ? 'ready'
      : 'offline';
  const runSummary = liveRaidRun
    ? liveRaidRun.directResponse
      ? 'Direct inference route'
      : `${liveRaidRun.spawn.selectedExperts} specialists · ${formatTimestamp(liveRaidRun.lastUpdatedAt)}`
    : null;

  return (
    <aside className="mercenary-sidebar mercenary-sidebar--compact">
      <MercenaryAgentCard />

      <section className="mercenary-run-panel">
        <div className="mercenary-run-panel__head">
          <span className="mercenary-run-panel__eyebrow">status</span>
          <StatusPill tone={runTone}>{runLabel}</StatusPill>
        </div>
        {runSummary ? <p className="mercenary-run-panel__summary">{runSummary}</p> : null}
        <div className="mercenary-run-panel__actions">
          {showReceiptLinks ? (
            <a className="mercenary-run-panel__chip" href={liveRaidRun?.spawn.receiptPath}>
              receipt
            </a>
          ) : null}
          {showTraceLink && liveRaidRun ? (
            <a
              className="mercenary-run-panel__chip"
              href={buildAgentLogPath(liveRaidRun)}
              rel="noreferrer"
              target="_blank"
            >
              trace
            </a>
          ) : null}
          {showReceiptLinks ? (
            <button
              className="mercenary-run-panel__chip mercenary-run-panel__chip--button"
              onClick={() => onCopyReceiptLink()}
              type="button"
            >
              {receiptCopied ? 'copied' : 'copy'}
            </button>
          ) : null}
        </div>
        <div className="mercenary-run-panel__proof">
          <span>attestation</span>
          <StatusPill tone={runtimeAttestationTone}>{runtimeAttestationStatus}</StatusPill>
        </div>
      </section>

      {showThreadList &&
      activeThreadId &&
      onSelectThread &&
      onNewThread &&
      onRenameThread &&
      onDeleteThread ? (
        <MercenaryThreadList
          activeThreadId={activeThreadId}
          onDeleteThread={onDeleteThread}
          onNewThread={onNewThread}
          onRenameThread={onRenameThread}
          onSelectThread={onSelectThread}
          threads={threads}
        />
      ) : null}

      {liveRaidRun && !liveRaidRun.directResponse && highlightedSidebarSpecialists.length > 0 ? (
        <details className="mercenary-drawer" open={!raidIsTerminal}>
          <summary className="mercenary-drawer__summary">
            <span>specialists</span>
            <strong>{highlightedSidebarSpecialists.length}</strong>
          </summary>
          <div className="mercenary-drawer__body">
            <ul className="mercenary-roster">
              {highlightedSidebarSpecialists.slice(0, 4).map((specialist) => (
                <li className="mercenary-roster__item" key={specialist.providerId}>
                  <div className="mercenary-roster__main">
                    <span
                      className={`mercenary-sidebar__dot mercenary-sidebar__dot--${specialist.statusTone}`}
                    />
                    <strong>{specialist.displayName}</strong>
                  </div>
                  <div className="mercenary-roster__side">
                    <span>{specialist.statusLabel}</span>
                    {specialist.progressValue != null ? (
                      <SpecialistProgressMeter
                        progressValue={specialist.progressValue}
                        tone={specialist.statusTone}
                      />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}

      {showTracePanel ? (
        <details className="mercenary-drawer">
          <summary className="mercenary-drawer__summary">
            <span>trace</span>
            <strong>{traceEventCount}</strong>
          </summary>
          <div className="mercenary-drawer__body mercenary-drawer__body--trace">
            {mercenaryDecisionTrace.slice(0, 3).map((decision, index) => (
              <div
                className="mercenary-trace__event"
                key={`${decision.type}:${decision.at}:${index}`}
              >
                <div className="mercenary-trace__event-meta">
                  <strong>{humanizeStatus(decision.type)}</strong>
                  <span>{formatTimestamp(decision.at)}</span>
                </div>
                <p>{decision.summary}</p>
              </div>
            ))}
            {specialistTraces.slice(0, 2).map((trace) => (
              <div className="mercenary-trace__event" key={trace.providerId}>
                <div className="mercenary-trace__event-meta">
                  <strong>{trace.displayName}</strong>
                  <StatusPill tone={trace.statusTone}>{trace.statusLabel}</StatusPill>
                </div>
                {trace.outcome ? <p>{trace.outcome}</p> : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </aside>
  );
}
