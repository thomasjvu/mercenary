import type { SubmissionArtifact } from '@bossraid/shared-types';
import {
  artifactKindLabel,
  buildArtifactDownloadName,
  buildBundleFileDownloadName,
  isRenderableImageArtifact,
  isRenderableVideoArtifact,
  parseBundleArtifact,
} from '../../lib/demo-artifacts.js';

type ArtifactCardProps = {
  artifact: SubmissionArtifact;
  onOpenArtifact: (artifact: SubmissionArtifact) => void;
};

export function ArtifactCard({ artifact, onOpenArtifact }: ArtifactCardProps) {
  const isImage = isRenderableImageArtifact(artifact);
  const isVideo = isRenderableVideoArtifact(artifact);
  const bundle = parseBundleArtifact(artifact);
  const bundlePreviewFiles = bundle?.files.slice(0, 5) ?? [];
  const bundleImageFiles =
    bundle?.files.filter((file) => file.mimeType.startsWith('image/')).slice(0, 3) ?? [];

  return (
    <article className={`mercenary-artifact mercenary-artifact--${artifact.outputType}`}>
      {isImage ? (
        <button
          className="mercenary-artifact__preview"
          onClick={() => onOpenArtifact(artifact)}
          type="button"
        >
          <img alt={artifact.label} loading="lazy" src={artifact.uri} />
        </button>
      ) : null}

      {isVideo ? (
        <div className="mercenary-artifact__preview mercenary-artifact__preview--video">
          <video controls preload="metadata" src={artifact.uri} />
        </div>
      ) : null}

      {bundle ? (
        <div className="mercenary-artifact__bundle">
          {bundleImageFiles.length > 0 ? (
            <div className="mercenary-artifact__bundle-strip">
              {bundleImageFiles.map((file) => (
                <img
                  alt={file.relativePath}
                  key={file.relativePath}
                  loading="lazy"
                  src={file.uri}
                />
              ))}
            </div>
          ) : null}
          <p>{`${bundle.files.length} generated files`}</p>
          <div className="mercenary-artifact__bundle-files">
            {bundlePreviewFiles.map((file) => (
              <a
                className="mercenary-artifact__bundle-file"
                download={buildBundleFileDownloadName(file.relativePath)}
                href={file.uri}
                key={file.relativePath}
              >
                {file.relativePath}
              </a>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mercenary-artifact__meta">
        <span>{artifactKindLabel(artifact)}</span>
        <strong>{artifact.label}</strong>
        {artifact.description ? <p>{artifact.description}</p> : null}
      </div>

      <div className="mercenary-artifact__actions">
        {(isImage || isVideo) && !artifact.uri.startsWith('data:application/json') ? (
          <button
            className="mercenary-artifact__action"
            onClick={() => onOpenArtifact(artifact)}
            type="button"
          >
            open
          </button>
        ) : null}
        <a
          className="mercenary-artifact__action"
          download={buildArtifactDownloadName(artifact)}
          href={artifact.uri}
        >
          download
        </a>
      </div>
    </article>
  );
}
