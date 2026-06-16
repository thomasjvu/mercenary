import { ArtifactStrip, SettlementProofPanel } from '@bossraid/ui';
import type { RaidListItem, RaidResult, RaidStatus } from '../api';
import { OpsRaidList } from './OpsRaidList';
import { OpsSpawnPanel } from './OpsSpawnPanel';
import {
  formatMs,
  formatTimestamp,
  formatUsd,
  Metric,
  ScoreCard,
  SignalTag,
  SnapshotRow,
  WorkstreamCard,
} from './ops-ui';

type OpsRaidDetailProps = {
  raids: RaidListItem[];
  raidId: string | null;
  raidStatus: RaidStatus | undefined;
  raidResult: RaidResult | undefined;
  selectedRaid: RaidListItem | undefined;
  activeRaidId: string;
  approvedProviders: string[];
  expertStates: RaidStatus['experts'];
  engagedExperts: number;
  rankedSubmissions: NonNullable<RaidResult['rankedSubmissions']>;
  synthesizedOutput: RaidResult['synthesizedOutput'];
  synthesizedWorkstreams: NonNullable<RaidResult['synthesizedOutput']>['workstreams'];
  synthesizedArtifacts: NonNullable<RaidResult['synthesizedOutput']>['artifacts'];
  routingProof: RaidResult['routingProof'];
  settlementExecution: RaidResult['settlementExecution'];
  reputationEvents: RaidResult['reputationEvents'];
  receiptCopied: boolean;
  spawnPayload: string;
  spawnError: string | null;
  onSelectRaid: (raidId: string) => void;
  onCopyReceipt: () => void;
  onSpawnPayloadChange: (value: string) => void;
};

export function OpsRaidDetail({
  raids,
  raidId,
  raidStatus,
  raidResult,
  selectedRaid,
  activeRaidId,
  approvedProviders,
  expertStates,
  engagedExperts,
  rankedSubmissions,
  synthesizedOutput,
  synthesizedWorkstreams,
  synthesizedArtifacts,
  routingProof,
  settlementExecution,
  reputationEvents,
  receiptCopied,
  spawnPayload,
  spawnError,
  onSelectRaid,
  onCopyReceipt,
  onSpawnPayloadChange,
}: OpsRaidDetailProps) {
  return (
    <>
      <section className="ops-workbench">
        <div className="ops-column">
          <article className="ops-panel ops-panel--queue">
            <div className="panel-head">
              <div>
                <p className="ops-label">raid queue</p>
                <h3>Current raids</h3>
              </div>
              <SignalTag label="internal" variant="internal" />
            </div>
            <OpsRaidList raids={raids} selectedRaidId={raidId} onSelect={onSelectRaid} />
          </article>

          <article className="ops-panel ops-panel--timeline">
            <div className="panel-head">
              <div>
                <p className="ops-label">timeline</p>
                <h3>Provider movement</h3>
              </div>
            </div>
            <div className="timeline">
              {expertStates.slice(0, 8).map((expert) => (
                <div className="timeline-row" key={expert.providerId}>
                  <div>
                    <strong>{expert.providerId}</strong>
                    <span>{expert.message ?? 'awaiting work'}</span>
                  </div>
                  <div className="timeline-meta">
                    <span>{expert.status}</span>
                    <span>{formatMs(expert.latencyMs)}</span>
                  </div>
                </div>
              ))}
              {expertStates.length === 0 ? (
                <p className="quiet-note">No provider movement yet.</p>
              ) : null}
            </div>
          </article>
        </div>

        <div className="ops-column">
          <OpsSpawnPanel
            spawnError={spawnError}
            spawnPayload={spawnPayload}
            onPayloadChange={onSpawnPayloadChange}
          />

          <article className="ops-panel ops-panel--output">
            <div className="panel-head">
              <div>
                <p className="ops-label">synthesized output</p>
                <h3>
                  {synthesizedOutput?.contributingProviderIds.length
                    ? `${synthesizedOutput.contributingProviderIds.length} contributors`
                    : 'Pending'}
                </h3>
              </div>
            </div>
            <div className="result-preview">
              {synthesizedOutput?.answerText ? (
                <p>{synthesizedOutput.answerText}</p>
              ) : synthesizedOutput?.explanation ? (
                <p>{synthesizedOutput.explanation}</p>
              ) : raidResult?.primarySubmission?.submission.answerText ? (
                <p>{raidResult.primarySubmission.submission.answerText}</p>
              ) : raidResult?.primarySubmission?.submission.explanation ? (
                <p>{raidResult.primarySubmission.submission.explanation}</p>
              ) : (
                <p className="quiet-note">No approved output yet.</p>
              )}
            </div>
            {synthesizedOutput?.patchUnifiedDiff ? (
              <pre className="diff-preview">{synthesizedOutput.patchUnifiedDiff}</pre>
            ) : raidResult?.primarySubmission?.submission.patchUnifiedDiff ? (
              <pre className="diff-preview">
                {raidResult.primarySubmission.submission.patchUnifiedDiff}
              </pre>
            ) : null}
            {(synthesizedArtifacts ?? []).length ? (
              <ArtifactStrip artifacts={synthesizedArtifacts ?? []} />
            ) : null}
            {synthesizedWorkstreams.length ? (
              <div className="scoreboard">
                {synthesizedWorkstreams.map((workstream) => (
                  <WorkstreamCard key={workstream.id} workstream={workstream} />
                ))}
              </div>
            ) : null}
          </article>
        </div>
      </section>

      <section className="ops-proof">
        <article className="ops-panel ops-panel--receipt">
          <div className="panel-head">
            <div>
              <p className="ops-label">receipt</p>
              <h3>Proof and settlement</h3>
            </div>
            <button className="button" onClick={onCopyReceipt} type="button">
              {receiptCopied ? 'copied' : 'copy receipt'}
            </button>
          </div>
          <SettlementProofPanel
            activeRaidId={activeRaidId}
            approvedProviderCount={approvedProviders.length}
            reputationEvents={reputationEvents ?? []}
            resultStatus={raidResult?.status ?? selectedRaid?.status ?? 'idle'}
            routingProof={routingProof}
            settlementExecution={settlementExecution}
            variant="ops"
          />
        </article>

        <article className="ops-panel ops-panel--scoreboard">
          <div className="panel-head">
            <div>
              <p className="ops-label">ranking</p>
              <h3>Contribution scoreboard</h3>
            </div>
            <SignalTag label={`${rankedSubmissions.length} seen`} variant="internal" />
          </div>
          <div className="scoreboard">
            {rankedSubmissions.length ? (
              rankedSubmissions.map((entry) => (
                <ScoreCard key={`${entry.submission.providerId}-${entry.rank}`} entry={entry} />
              ))
            ) : (
              <p className="quiet-note">No ranked submissions yet.</p>
            )}
          </div>
        </article>
      </section>
    </>
  );
}

export function OpsRaidHeroMetrics({
  raidStatus,
  selectedRaid,
  approvedProviderCount,
  payoutPerSuccessfulProvider,
}: {
  raidStatus: RaidStatus | undefined;
  selectedRaid: RaidListItem | undefined;
  approvedProviderCount: number;
  payoutPerSuccessfulProvider: number | undefined;
}) {
  return (
    <section className="ops-metrics" aria-label="Raid metrics">
      <Metric label="status" value={raidStatus?.status ?? selectedRaid?.status ?? 'idle'} />
      <Metric label="approved" value={String(approvedProviderCount)} />
      <Metric label="split" value={formatUsd(payoutPerSuccessfulProvider)} />
      <Metric label="risk" value={raidStatus?.sanitization.riskTier ?? 'n/a'} />
    </section>
  );
}

export function OpsRaidSnapshot({
  raidStatus,
  selectedRaid,
  activeRaidId,
  engagedExperts,
  approvedProviderCount,
  dangerState,
}: {
  raidStatus: RaidStatus | undefined;
  selectedRaid: RaidListItem | undefined;
  activeRaidId: string;
  engagedExperts: number;
  approvedProviderCount: number;
  dangerState: boolean;
}) {
  return (
    <article className="ops-window ops-window--back">
      <div className="ops-window__head">
        <div>
          <p className="ops-label">raid snapshot</p>
          <h2>{activeRaidId}</h2>
        </div>
        <SignalTag
          label={dangerState ? 'limits' : 'stable'}
          variant={dangerState ? 'danger' : 'default'}
          blinking={dangerState}
        />
      </div>
      <div className="snapshot-grid">
        <SnapshotRow label="status" value={raidStatus?.status ?? selectedRaid?.status ?? 'idle'} />
        <SnapshotRow label="created" value={formatTimestamp(selectedRaid?.createdAt)} />
        <SnapshotRow label="experts" value={String(engagedExperts)} />
        <SnapshotRow label="approved" value={String(approvedProviderCount)} />
        <SnapshotRow label="risk" value={raidStatus?.sanitization.riskTier ?? 'n/a'} />
        <SnapshotRow label="updated" value={formatTimestamp(selectedRaid?.updatedAt)} />
      </div>
    </article>
  );
}

export function OpsHeroStatRow({
  healthOk,
  readyProviders,
  activeProviders,
  raidCount,
}: {
  healthOk: boolean;
  readyProviders: number;
  activeProviders: number;
  raidCount: number;
}) {
  return (
    <div aria-label="Ops health statistics" className="stat-ribbon">
      <div className="stat-ribbon__item">
        <span>core</span>
        <strong>{healthOk ? 'online' : 'offline'}</strong>
      </div>
      <div className="stat-ribbon__item">
        <span>ready</span>
        <strong>{readyProviders}</strong>
      </div>
      <div className="stat-ribbon__item">
        <span>live</span>
        <strong>{activeProviders}</strong>
      </div>
      <div className="stat-ribbon__item">
        <span>raids</span>
        <strong>{raidCount}</strong>
      </div>
    </div>
  );
}
