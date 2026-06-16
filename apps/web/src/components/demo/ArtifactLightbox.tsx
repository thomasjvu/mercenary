import type { SubmissionArtifact } from '@bossraid/shared-types';
import {
  artifactKindLabel,
  isRenderableImageArtifact,
  isRenderableVideoArtifact,
} from '../../lib/demo-artifacts.js';

type ArtifactLightboxProps = {
  artifact: SubmissionArtifact;
  onClose: () => void;
};

export function ArtifactLightbox({ artifact, onClose }: ArtifactLightboxProps) {
  const isImage = isRenderableImageArtifact(artifact);
  const isVideo = isRenderableVideoArtifact(artifact);

  if (!isImage && !isVideo) {
    return null;
  }

  return (
    <div className="mercenary-lightbox" onClick={onClose} role="presentation">
      <div
        className="mercenary-lightbox__dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mercenary-lightbox__head">
          <div>
            <span>{artifactKindLabel(artifact)}</span>
            <strong>{artifact.label}</strong>
          </div>
          <button className="mercenary-lightbox__close" onClick={onClose} type="button">
            close
          </button>
        </div>

        <div className="mercenary-lightbox__body">
          {isImage ? <img alt={artifact.label} src={artifact.uri} /> : null}
          {isVideo ? <video controls preload="metadata" src={artifact.uri} /> : null}
        </div>
      </div>
    </div>
  );
}
