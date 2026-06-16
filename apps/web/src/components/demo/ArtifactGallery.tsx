import type { SubmissionArtifact } from '@bossraid/shared-types';
import { ArtifactCard } from './ArtifactCard.js';

type ArtifactGalleryProps = {
  artifacts: SubmissionArtifact[];
  onOpenArtifact: (artifact: SubmissionArtifact) => void;
};

export function ArtifactGallery({ artifacts, onOpenArtifact }: ArtifactGalleryProps) {
  return (
    <div className="mercenary-artifact-grid">
      {artifacts.map((artifact) => (
        <ArtifactCard
          artifact={artifact}
          key={`${artifact.outputType}:${artifact.label}:${artifact.uri}`}
          onOpenArtifact={onOpenArtifact}
        />
      ))}
    </div>
  );
}
