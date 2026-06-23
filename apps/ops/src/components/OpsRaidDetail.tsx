import { useState } from 'react';
import { ArtifactStrip, SettlementProofPanel } from '@bossraid/ui';
import type { RaidListItem, RaidResult, RaidStatus } from '../api';
import { buildConsumerReceiptUrl } from '../lib/consumer-urls';
import { OpsRaidList } from './OpsRaidList';
import { OpsKpiTile, OpsSubNav } from './ops-visual';
import { formatMs, formatUsd, ScoreCard, SignalTag, WorkstreamCard } from './ops-ui';

type LiveSubView = 'overview' | 'output' | 'proof' | 'rankings';

type OpsRaidDetailProps = {
  raids: RaidListItem[];
  raidId: string | null;
  raidStatus: RaidStatus | undefined;
  raidResult: RaidResult | undefined;
  selectedRaid: RaidListItem | undefined;
  activeRaidId: string;
  approvedProviders: string[];
  expertStates: RaidStatus['experts'];
  rankedSubmissions: NonNullable<RaidResult['rankedSubmissions']>;
  synthesizedOutput: RaidResult['synthesizedOutput'];
  synthesizedWorkstreams: NonNullable<RaidResult['synthesizedOutput']>['workstreams'];
  synthesizedArtifacts: NonNullable<RaidResult['synthesizedOutput']>['artifacts'];
  routingProof: RaidResult['routingProof'];
  settlementExecution: RaidResult['settlementExecution'];
  reputationEvents: RaidResult['reputationEvents'];
  receiptCopied: boolean;
  buyerReceiptToken: string | null;
  canAbort: boolean;
  canReplay: boolean;
  actionPending: 'abort' | 'replay' | null;
  actionError: string | null;
  onSelectRaid: (raidId: string) => void;
  onCopyReceipt: () => void;
  onRequestAbort: () => void;
  onRequestReplay: () => void;
};

const LIVE_SUB_VIEWS: Array<{
  id: LiveSubView;
  label: string;
  icon: 'raid' | 'output' | 'proof' | 'rank';
}> = [
  { id: 'overview', label: 'overview', icon: 'raid' },
  { id: 'output', label: 'output', icon: 'output' },
  { id: 'proof', label: 'proof', icon: 'proof' },
  { id: 'rankings', label: 'rankings', icon: 'rank' },
];

export function OpsRaidDetail({
  raids,
  raidId,
  raidResult,
  selectedRaid,
  activeRaidId,
  approvedProviders,
  expertStates,
  rankedSubmissions,
  synthesizedOutput,
  synthesizedWorkstreams,
  synthesizedArtifacts,
  routingProof,
  settlementExecution,
  reputationEvents,
  receiptCopied,
  buyerReceiptToken,
  canAbort,
  canReplay,
  actionPending,
  actionError,
  onSelectRaid,
  onCopyReceipt,
  onRequestAbort,
  onRequestReplay,
}: OpsRaidDetailProps) {
  const [subView, setSubView] = useState<LiveSubView>('overview');
  const buyerReceiptUrl =
    raidId && buyerReceiptToken
      ? buildConsumerReceiptUrl({ raidId, token: buyerReceiptToken })
      : null;

  return (
    <section className="ops-raid-detail">
      <OpsSubNav
        activeId={subView}
        items={LIVE_SUB_VIEWS}
        onSelect={(id) => setSubView(id as LiveSubView)}
      />

      {subView === 'overview' ? (
        <>
          <section className="ops-live-actions flat-section">
            <div className="panel-head">
              <div>
                <p className="eyebrow">controls</p>
                <h2>{activeRaidId}</h2>
              </div>
              <div className="ops-live-actions__buttons">
                <button
                  className="button"
                  disabled={!canReplay || actionPending != null}
                  onClick={onRequestReplay}
                  type="button"
                >
                  {actionPending === 'replay' ? 'replaying' : 're-score'}
                </button>
                <button
                  className="button button--danger"
                  disabled={!canAbort || actionPending != null}
                  onClick={onRequestAbort}
                  type="button"
                >
                  {actionPending === 'abort' ? 'aborting' : 'abort'}
                </button>
              </div>
            </div>
            {actionError ? <p className="error-note">{actionError}</p> : null}
          </section>

          <section className="ops-workbench">
            <article className="ops-panel ops-panel--queue">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">queue</p>
                  <h3>Raids</h3>
                </div>
                <SignalTag label={String(raids.length)} variant="internal" />
              </div>
              <OpsRaidList raids={raids} selectedRaidId={raidId} onSelect={onSelectRaid} />
            </article>

            <article className="ops-panel ops-panel--timeline">
              <div className="panel-head">
                <div>
                  <p className="eyebrow">timeline</p>
                  <h3>Providers</h3>
                </div>
              </div>
              <div className="timeline">
                {expertStates.slice(0, 8).map((expert) => (
                  <div className="timeline-row" key={expert.providerId}>
                    <div>
                      <strong>{expert.providerId}</strong>
                      <span>{expert.message ?? 'awaiting'}</span>
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
          </section>
        </>
      ) : null}

      {subView === 'output' ? (
        <article className="ops-panel ops-panel--output">
          <div className="panel-head">
            <div>
              <p className="eyebrow">synthesis</p>
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
            <details className="ops-fold">
              <summary className="ops-fold__summary">
                <span className="ops-fold__title">
                  <span>unified diff</span>
                </span>
              </summary>
              <div className="ops-fold__body">
                <pre className="diff-preview">{synthesizedOutput.patchUnifiedDiff}</pre>
              </div>
            </details>
          ) : raidResult?.primarySubmission?.submission.patchUnifiedDiff ? (
            <details className="ops-fold">
              <summary className="ops-fold__summary">
                <span className="ops-fold__title">
                  <span>unified diff</span>
                </span>
              </summary>
              <div className="ops-fold__body">
                <pre className="diff-preview">
                  {raidResult.primarySubmission.submission.patchUnifiedDiff}
                </pre>
              </div>
            </details>
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
      ) : null}

      {subView === 'proof' ? (
        <article className="ops-panel ops-panel--receipt">
          <div className="panel-head">
            <div>
              <p className="eyebrow">receipt</p>
              <h3>Proof & settlement</h3>
            </div>
            <div className="ops-proof-actions">
              {buyerReceiptUrl ? (
                <a
                  className="button button--primary"
                  href={buyerReceiptUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  receipt
                </a>
              ) : null}
              <button className="button" onClick={onCopyReceipt} type="button">
                {receiptCopied ? 'copied' : 'copy json'}
              </button>
            </div>
          </div>
          {!buyerReceiptUrl ? (
            <p className="quiet-note">Buyer receipt needs raidAccessToken from spawn.</p>
          ) : null}
          <SettlementProofPanel
            activeRaidId={activeRaidId}
            approvedProviderCount={approvedProviders.length}
            payoutPerSuccessfulProvider={raidResult?.settlement?.payoutPerSuccessfulProvider}
            reputationEvents={reputationEvents ?? []}
            resultStatus={raidResult?.status ?? selectedRaid?.status ?? 'idle'}
            routingProof={routingProof}
            settlementExecution={settlementExecution}
            variant="ops"
          />
        </article>
      ) : null}

      {subView === 'rankings' ? (
        <article className="ops-panel ops-panel--scoreboard">
          <div className="panel-head">
            <div>
              <p className="eyebrow">ranking</p>
              <h3>Contributions</h3>
            </div>
            <SignalTag label={`${rankedSubmissions.length}`} variant="internal" />
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
      ) : null}
    </section>
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
  const status = raidStatus?.status ?? selectedRaid?.status ?? 'idle';
  const statusTone =
    status === 'final' || status === 'first_valid'
      ? 'good'
      : status === 'running'
        ? 'accent'
        : 'default';

  return (
    <section aria-label="Raid metrics" className="ops-kpi-grid">
      <OpsKpiTile icon="raid" label="status" tone={statusTone} value={status} />
      <OpsKpiTile icon="providers" label="approved" value={String(approvedProviderCount)} />
      <OpsKpiTile icon="payment" label="split" value={formatUsd(payoutPerSuccessfulProvider)} />
      <OpsKpiTile
        icon="shield"
        label="risk"
        tone={raidStatus?.sanitization.riskTier === 'high' ? 'danger' : 'default'}
        value={raidStatus?.sanitization.riskTier ?? 'n/a'}
      />
    </section>
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
  const readyPct = Math.min((readyProviders / Math.max(activeProviders, 1)) * 100, 100);

  return (
    <div aria-label="Ops health statistics" className="ops-kpi-grid ops-kpi-grid--compact">
      <OpsKpiTile
        icon="shield"
        label="core"
        tone={healthOk ? 'good' : 'danger'}
        value={healthOk ? 'online' : 'offline'}
      />
      <OpsKpiTile icon="mesh" label="ready" meter={readyPct} value={String(readyProviders)} />
      <OpsKpiTile icon="live" label="live" value={String(activeProviders)} />
      <OpsKpiTile icon="raid" label="raids" value={String(raidCount)} />
    </div>
  );
}
