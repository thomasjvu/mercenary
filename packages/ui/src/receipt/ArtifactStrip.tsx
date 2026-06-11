import {
  isRenderableImageArtifact,
  isRenderableVideoArtifact,
  shortValue,
} from '@bossraid/proof-ui';
import type { SubmissionArtifactView } from '@bossraid/shared-types';

type ArtifactStripProps = {
  artifacts: SubmissionArtifactView[];
  compact?: boolean;
  labelClassName?: string;
  cardClassName?: string;
};

export function ArtifactStrip({
  artifacts,
  compact = false,
  labelClassName = 'ops-label',
  cardClassName = 'scorecard',
}: ArtifactStripProps) {
  const visibleArtifacts = compact ? artifacts.slice(0, 3) : artifacts;

  return (
    <div
      style={{
        display: 'grid',
        gap: '0.75rem',
        gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))',
        marginTop: '1rem',
      }}
    >
      {visibleArtifacts.map((artifact) => (
        <article
          className={cardClassName}
          key={`${artifact.outputType}-${artifact.uri}`}
          style={{ gap: '0.6rem' }}
        >
          {isRenderableImageArtifact(artifact) ? (
            <img
              alt={artifact.label}
              loading="lazy"
              src={artifact.uri}
              style={{
                width: '100%',
                maxHeight: compact ? '120px' : '220px',
                objectFit: 'cover',
                borderRadius: '0.9rem',
              }}
            />
          ) : null}
          {isRenderableVideoArtifact(artifact) ? (
            <video
              controls
              preload="metadata"
              src={artifact.uri}
              style={{
                width: '100%',
                maxHeight: compact ? '150px' : '240px',
                borderRadius: '0.9rem',
              }}
            />
          ) : null}
          <div>
            <span className={labelClassName}>
              {artifact.mimeType
                ? `${artifact.outputType} · ${artifact.mimeType}`
                : artifact.outputType}
            </span>
            <h3>{artifact.label}</h3>
            {!compact && artifact.description ? (
              <p className="scorecard__summary">{artifact.description}</p>
            ) : null}
            <p className="quiet-note">
              <a href={artifact.uri} rel="noreferrer" target="_blank">
                {compact ? 'open artifact' : shortValue(artifact.uri)}
              </a>
              {artifact.sha256 ? ` · sha ${shortValue(artifact.sha256)}` : ''}
            </p>
          </div>
        </article>
      ))}
      {artifacts.length > visibleArtifacts.length ? (
        <p className="quiet-note">
          +{artifacts.length - visibleArtifacts.length} more artifact refs
        </p>
      ) : null}
    </div>
  );
}
