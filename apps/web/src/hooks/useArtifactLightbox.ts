import { useEffect } from 'react';
import type { SubmissionArtifact } from '@bossraid/shared-types';

export function useArtifactLightbox(
  expandedArtifact: SubmissionArtifact | null,
  onClose: () => void
) {
  useEffect(() => {
    if (!expandedArtifact) {
      return;
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedArtifact, onClose]);
}
