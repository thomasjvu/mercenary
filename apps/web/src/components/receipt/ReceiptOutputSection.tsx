import { ArtifactPreview } from '@bossraid/ui';
import type { RaidResult } from '../../api';
import {
  compactText,
  pickPreviewArtifacts,
  summarizeCanonicalOutput,
} from '../../lib/receipt-helpers';
import {
  selectPrimaryOutputType,
  selectSynthesizedArtifacts,
  selectWorkstreams,
} from '../../lib/raid-result-view';
import { ReceiptStat } from '@bossraid/ui';

type ReceiptOutputSectionProps = {
  result: RaidResult | undefined;
  currentReceiptStatus: string;
  approvedSubmissionCount: number;
  compact?: boolean;
};

export function ReceiptOutputSection({
  result,
  currentReceiptStatus,
  approvedSubmissionCount,
  compact = false,
}: ReceiptOutputSectionProps) {
  const workstreams = selectWorkstreams(result);
  const synthesizedArtifacts = selectSynthesizedArtifacts(result);
  const canonicalSummary = summarizeCanonicalOutput(result);
  const previewArtifacts = pickPreviewArtifacts(synthesizedArtifacts);
  const primaryOutputType = selectPrimaryOutputType(result);
  const visibleWorkstreams = workstreams.slice(0, 4);

  return (
    <article
      className={`receipt-surface receipt-surface--wide${compact ? ' receipt-surface--compact' : ''}`}
    >
      {!compact ? (
        <div className="receipt-surface__head">
          <div>
            <p className="eyebrow">result</p>
            <h2>Output</h2>
          </div>
          <span className="receipt-state">{currentReceiptStatus}</span>
        </div>
      ) : null}
      <div className={`receipt-outcome${compact ? ' receipt-outcome--compact' : ''}`}>
        <div className="receipt-outcome__copy">
          {compact ? (
            <div className="receipt-outcome__lead">
              <span className="receipt-kicker">{primaryOutputType}</span>
              <span className="receipt-outcome__meta">
                {approvedSubmissionCount} approved · {workstreams.length} workstreams
              </span>
            </div>
          ) : (
            <strong className="receipt-kicker">{primaryOutputType}</strong>
          )}
          <p className={`receipt-panel__text${compact ? '' : ' receipt-panel__text--clamped'}`}>
            {canonicalSummary}
          </p>
          {!compact ? (
            <div className="receipt-stat-grid">
              <ReceiptStat label="type" value={primaryOutputType} />
              <ReceiptStat label="workstreams" value={String(workstreams.length)} />
              <ReceiptStat label="artifacts" value={String(synthesizedArtifacts.length)} />
              <ReceiptStat label="approved" value={String(approvedSubmissionCount)} />
            </div>
          ) : null}
          {!compact && visibleWorkstreams.length > 0 ? (
            <div className="receipt-workstream-list">
              {visibleWorkstreams.map((workstream) => (
                <div className="receipt-workstream-row" key={workstream.id}>
                  <strong>{workstream.label}</strong>
                  <span>{compactText(workstream.shortSummary ?? workstream.summary, 120)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {previewArtifacts.length ? (
          <div className="receipt-preview-stack">
            {previewArtifacts.map((artifact) => (
              <ArtifactPreview artifact={artifact} key={`${artifact.outputType}-${artifact.uri}`} />
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
