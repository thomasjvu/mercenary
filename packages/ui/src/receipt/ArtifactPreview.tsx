import { isRenderableImageArtifact, isRenderableVideoArtifact } from '@bossraid/proof-ui';
import type { SubmissionArtifactView } from '@bossraid/shared-types';

type ArtifactPreviewProps = {
  artifact: SubmissionArtifactView;
  imageClassName?: string;
  videoClassName?: string;
  fallbackClassName?: string;
};

export function ArtifactPreview({
  artifact,
  imageClassName = 'receipt-preview-media',
  videoClassName = 'receipt-preview-media',
  fallbackClassName = 'receipt-preview-fallback',
}: ArtifactPreviewProps) {
  if (isRenderableImageArtifact(artifact)) {
    return (
      <img alt={artifact.label} className={imageClassName} loading="lazy" src={artifact.uri} />
    );
  }

  if (isRenderableVideoArtifact(artifact)) {
    return <video className={videoClassName} controls preload="metadata" src={artifact.uri} />;
  }

  return (
    <div className={fallbackClassName}>
      <span>{artifact.outputType}</span>
      <strong>{artifact.label}</strong>
    </div>
  );
}
