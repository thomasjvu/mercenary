import type { RaidAgentLog } from '../../api';
import { useAttestationInspector } from '../../contexts/AttestationInspectorContext.js';
import {
  buildAgentLogPath,
  buildAttestedResultPath,
  buildAttestedRuntimePath,
  formatTimestamp,
  humanizeStatus,
  type ConversationSpecialistRecord,
  type LiveRaidRun,
  type SpecialistTraceRecord,
} from '../../hooks/useRaidDemo';
import { SidebarRow, SpecialistProgressMeter, StatusPill } from './demo-ui';

type DemoRaidSidebarProps = {
  liveRaidRun: LiveRaidRun | null;
  raidIsTerminal: boolean;
  activeRaidStatus?: string;
  canLaunchLiveRaid: boolean;
  elapsedLabel: string;
  runSignals: Array<{ label: string; value: string }>;
  showReceiptLinks: boolean;
  showTraceLink: boolean;
  showResultProofLink: boolean;
  receiptCopied: boolean;
  onCopyReceiptLink: () => void;
  runtimeAttestationLabel: string;
  runtimeAttestationTone: 'ready' | 'available' | 'offline' | 'working';
  runtimeAttestationStatus: string;
  attestationSignals: Array<{ label: string; value: string }>;
  runtimeAttestation: unknown;
  runtimeAttestationSignerDisabled: boolean;
  runtimeAttestationError: string | null;
  runtimeAttestationTarget: string;
  runtimeAttestationTee: string;
  highlightedSidebarSpecialists: ConversationSpecialistRecord[];
  specialistRosterCount: number;
  compactAvailabilityLabel: string;
  showTracePanel: boolean;
  traceEventCount: number;
  mercenaryDecisionTrace: RaidAgentLog['decisions'];
  specialistTraces: SpecialistTraceRecord[];
};

export function DemoRaidSidebar({
  liveRaidRun,
  raidIsTerminal,
  activeRaidStatus,
  canLaunchLiveRaid,
  runSignals,
  showReceiptLinks,
  showTraceLink,
  showResultProofLink,
  receiptCopied,
  onCopyReceiptLink,
  runtimeAttestationLabel,
  runtimeAttestationTone,
  runtimeAttestationStatus,
  attestationSignals,
  runtimeAttestation,
  runtimeAttestationSignerDisabled,
  runtimeAttestationError,
  runtimeAttestationTarget,
  runtimeAttestationTee,
  highlightedSidebarSpecialists,
  specialistRosterCount,
  compactAvailabilityLabel,
  showTracePanel,
  traceEventCount,
  mercenaryDecisionTrace,
  specialistTraces,
}: DemoRaidSidebarProps) {
  const { openInspector } = useAttestationInspector();

  return (
    <aside className="mercenary-sidebar">
      <section className="mercenary-sidebar__panel">
        <div className="mercenary-sidebar__head">
          <div>
            <span className="mercenary-sidebar__eyebrow">Run</span>
            <strong>
              {liveRaidRun?.directResponse
                ? 'Direct reply'
                : liveRaidRun
                  ? 'Live state'
                  : 'Standby'}
            </strong>
          </div>
          <StatusPill
            tone={
              liveRaidRun
                ? raidIsTerminal
                  ? 'ready'
                  : 'working'
                : canLaunchLiveRaid
                  ? 'ready'
                  : 'offline'
            }
          >
            {liveRaidRun ? humanizeStatus(activeRaidStatus ?? 'queued') : 'idle'}
          </StatusPill>
        </div>

        <div className="mercenary-sidebar__signal-strip">
          {runSignals.map((signal) => (
            <SidebarRow key={`run:${signal.label}`} label={signal.label} value={signal.value} />
          ))}
        </div>

        {liveRaidRun?.lastUpdatedAt ? (
          <p className="mercenary-sidebar__note">{`Updated ${formatTimestamp(liveRaidRun.lastUpdatedAt)}`}</p>
        ) : null}

        {showReceiptLinks || showTraceLink ? (
          <div className="mercenary-sidebar__actionstrip">
            {showReceiptLinks ? (
              <a className="mercenary-sidebar__actionchip" href={liveRaidRun?.spawn.receiptPath}>
                receipt
              </a>
            ) : null}
            {showTraceLink && liveRaidRun ? (
              <a
                className="mercenary-sidebar__actionchip"
                href={buildAgentLogPath(liveRaidRun)}
                rel="noreferrer"
                target="_blank"
              >
                trace
              </a>
            ) : null}
            {showReceiptLinks ? (
              <button
                className="mercenary-sidebar__actionchip mercenary-sidebar__actionchip--button"
                onClick={() => onCopyReceiptLink()}
                type="button"
              >
                {receiptCopied ? 'copied' : 'copy link'}
              </button>
            ) : null}
          </div>
        ) : liveRaidRun?.directResponse ? (
          <p className="mercenary-sidebar__note">
            Direct v1 reply. Mercenary did not open a raid for this turn.
          </p>
        ) : (
          <p className="mercenary-sidebar__note">
            Proof and trace stay hidden until Mercenary opens a real run.
          </p>
        )}
      </section>

      <section className="mercenary-sidebar__panel">
        <div className="mercenary-sidebar__head">
          <div>
            <span className="mercenary-sidebar__eyebrow">Attestation</span>
            <strong>{runtimeAttestationLabel}</strong>
          </div>
          <StatusPill tone={runtimeAttestationTone}>{runtimeAttestationStatus}</StatusPill>
        </div>

        <div className="mercenary-sidebar__signal-strip">
          {attestationSignals.map((signal) => (
            <SidebarRow key={`attest:${signal.label}`} label={signal.label} value={signal.value} />
          ))}
        </div>

        <div className="mercenary-sidebar__actionstrip">
          <button
            className="mercenary-sidebar__actionchip mercenary-sidebar__actionchip--button"
            onClick={() => openInspector()}
            type="button"
          >
            open inspector
          </button>
        </div>

        <details className="mercenary-sidebar__disclosure">
          <summary className="mercenary-sidebar__disclosure-summary">
            <span>proof detail</span>
            <strong>
              {runtimeAttestation
                ? 'open'
                : runtimeAttestationSignerDisabled
                  ? 'unpublished'
                  : 'inspect'}
            </strong>
          </summary>

          <div className="mercenary-sidebar__actionstrip">
            <a
              className="mercenary-sidebar__actionchip"
              href={buildAttestedRuntimePath()}
              rel="noreferrer"
              target="_blank"
            >
              runtime proof
            </a>
            {showResultProofLink && liveRaidRun ? (
              <a
                className="mercenary-sidebar__actionchip"
                href={buildAttestedResultPath(liveRaidRun)}
                rel="noreferrer"
                target="_blank"
              >
                result proof
              </a>
            ) : null}
          </div>

          <p className="mercenary-sidebar__note">
            {runtimeAttestation
              ? `Runtime is attested on ${runtimeAttestationTarget} / ${runtimeAttestationTee}. Specialist TEE and signed badges come from routed provider privacy proofs and registry data.`
              : runtimeAttestationSignerDisabled
                ? 'Provider TEE and signed-output badges are still live from routed provider proofs. This host is not publishing signed runtime or result envelopes because MNEMONIC is not configured.'
                : (runtimeAttestationError ?? 'Loading runtime attestation.')}
          </p>
        </details>
      </section>

      <section className="mercenary-sidebar__panel">
        <div className="mercenary-sidebar__head">
          <div>
            <span className="mercenary-sidebar__eyebrow">Specialists</span>
            <strong>
              {liveRaidRun?.directResponse ? 'Not opened' : liveRaidRun ? 'Live roster' : 'Roster'}
            </strong>
          </div>
        </div>

        {liveRaidRun?.directResponse ? (
          <p className="mercenary-sidebar__note">
            Mercenary answered directly, so specialists stayed idle for this turn.
          </p>
        ) : liveRaidRun ? (
          <div className="mercenary-sidebar__specialists">
            {highlightedSidebarSpecialists.map((specialist) => (
              <div
                className="mercenary-sidebar__specialist mercenary-sidebar__specialist--compact"
                key={specialist.providerId}
              >
                <div className="mercenary-sidebar__specialist-copy">
                  <div className="mercenary-sidebar__specialist-label">
                    <span
                      className={`mercenary-sidebar__dot mercenary-sidebar__dot--${specialist.statusTone}`}
                    />
                    <strong>{specialist.displayName}</strong>
                  </div>
                  <small className="mercenary-sidebar__specialist-status">
                    {specialist.statusLabel}
                  </small>
                </div>
                <div className="mercenary-sidebar__specialist-side">
                  {specialist.progressValue != null ? (
                    <SpecialistProgressMeter
                      progressValue={specialist.progressValue}
                      tone={specialist.statusTone}
                    />
                  ) : null}
                </div>
              </div>
            ))}

            {highlightedSidebarSpecialists.length === 0 ? (
              <p className="mercenary-sidebar__note">Waiting for specialist state.</p>
            ) : null}
          </div>
        ) : (
          <div className="mercenary-sidebar__signal-strip">
            <SidebarRow label="roster" value={`${specialistRosterCount} listed`} />
            <SidebarRow label="ready" value={compactAvailabilityLabel} />
          </div>
        )}

        <div className="mercenary-sidebar__actionstrip">
          <a className="mercenary-sidebar__actionchip" href="/raiders">
            open raiders
          </a>
        </div>
      </section>

      {showTracePanel ? (
        <section className="mercenary-sidebar__panel">
          <details className="mercenary-sidebar__disclosure" open={!raidIsTerminal}>
            <summary className="mercenary-sidebar__disclosure-summary">
              <div className="mercenary-sidebar__specialist-copy">
                <span className="mercenary-sidebar__eyebrow">Trace</span>
                <strong>{raidIsTerminal ? 'Closed process trace' : 'Live process trace'}</strong>
              </div>
              <StatusPill
                tone={raidIsTerminal ? 'ready' : 'working'}
              >{`${traceEventCount} events`}</StatusPill>
            </summary>

            <div className="mercenary-trace-list">
              {mercenaryDecisionTrace.length > 0 ? (
                <details className="mercenary-trace" open={!raidIsTerminal}>
                  <summary className="mercenary-trace__summary">
                    <div>
                      <strong>Mercenary</strong>
                      <span>{`${mercenaryDecisionTrace.length} planning decisions`}</span>
                    </div>
                    <StatusPill tone={raidIsTerminal ? 'ready' : 'working'}>
                      {raidIsTerminal ? 'finalized' : 'planning'}
                    </StatusPill>
                  </summary>
                  <div className="mercenary-trace__events">
                    {mercenaryDecisionTrace.map((decision, index) => (
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
                  </div>
                </details>
              ) : null}

              {specialistTraces.map((trace) => (
                <details className="mercenary-trace" key={trace.providerId}>
                  <summary className="mercenary-trace__summary">
                    <div>
                      <strong>{trace.displayName}</strong>
                      <span>{trace.scope || 'specialist trace'}</span>
                    </div>
                    <StatusPill tone={trace.statusTone}>{trace.statusLabel}</StatusPill>
                  </summary>
                  <div className="mercenary-trace__events">
                    {trace.outcome ? (
                      <p className="mercenary-trace__outcome">{trace.outcome}</p>
                    ) : null}
                    {trace.events.map((event) => (
                      <div className="mercenary-trace__event" key={event.id}>
                        <div className="mercenary-trace__event-meta">
                          <strong>{event.label}</strong>
                          <span>{formatTimestamp(event.at)}</span>
                        </div>
                        <p>{event.note}</p>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </details>
        </section>
      ) : null}
    </aside>
  );
}
