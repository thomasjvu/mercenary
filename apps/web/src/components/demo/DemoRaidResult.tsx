import { useEffect } from 'react';
import type { SubmissionArtifact } from '@bossraid/shared-types';
import { isLowSignalChatPrompt } from '../../demo-chat.js';
import type { DemoRequestMode } from '../../hooks/useRaidDemo';
import { ChatMessage } from './demo-ui';

type BundleArtifactFile = {
  relativePath: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  uri: string;
};

type BundleArtifactPreview = {
  artifactId: string;
  files: BundleArtifactFile[];
};

type DemoRaidResultProps = {
  demoMode: DemoRequestMode;
  lastSubmittedBrief: string | null;
  liveResultText?: string;
  liveExplanation?: string;
  livePatch?: string;
  liveArtifacts: SubmissionArtifact[];
  requestMode?: DemoRequestMode;
  directResponse?: boolean;
  hasLiveRun: boolean;
  raidIsTerminal: boolean;
  expandedArtifact: SubmissionArtifact | null;
  onOpenArtifact: (artifact: SubmissionArtifact) => void;
  onCloseArtifact: () => void;
  onCopyReceiptLink?: () => void;
  onViewReceipt?: () => void;
  receiptCopied?: boolean;
  receiptPath?: string | null;
};

export function DemoRaidResult({
  demoMode,
  lastSubmittedBrief,
  liveResultText,
  liveExplanation,
  livePatch,
  liveArtifacts,
  requestMode,
  directResponse,
  hasLiveRun,
  raidIsTerminal,
  expandedArtifact,
  onOpenArtifact,
  onCloseArtifact,
  onCopyReceiptLink,
  onViewReceipt,
  receiptCopied = false,
  receiptPath,
}: DemoRaidResultProps) {
  useEffect(() => {
    if (!expandedArtifact) {
      return;
    }

    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        onCloseArtifact();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [expandedArtifact, onCloseArtifact]);

  return (
    <>
      {liveResultText || liveArtifacts.length > 0 || livePatch ? (
        <ChatMessage role="assistant" tone="success">
          {liveResultText ? (
            <p className="mercenary-final__answer">{liveResultText}</p>
          ) : (
            <p>Final delivery is ready.</p>
          )}
          {liveExplanation && !liveResultText ? <p>{liveExplanation}</p> : null}
          {requestMode === 'chat_v1' && !directResponse ? (
            <p className="mercenary-message__note">
              Returned through `/v1/chat/completions` and linked back to the same raid receipt and
              trace.
            </p>
          ) : null}

          {liveArtifacts.length > 0 ? (
            <ArtifactGallery artifacts={liveArtifacts} onOpenArtifact={onOpenArtifact} />
          ) : null}

          {livePatch ? <pre className="code-panel mercenary-final__code">{livePatch}</pre> : null}

          {raidIsTerminal && receiptPath ? (
            <div className="mercenary-receipt-cta">
              <a className="button button--primary" href={receiptPath}>
                view receipt
              </a>
              {onCopyReceiptLink ? (
                <button className="button" onClick={onCopyReceiptLink} type="button">
                  {receiptCopied ? 'copied' : 'copy receipt link'}
                </button>
              ) : null}
            </div>
          ) : null}
        </ChatMessage>
      ) : null}

      {hasLiveRun &&
      raidIsTerminal &&
      !liveResultText &&
      liveArtifacts.length === 0 &&
      !livePatch ? (
        <ChatMessage role="assistant" tone="error">
          <p>
            {demoMode === 'chat_v1'
              ? 'Mercenary did not get an approved specialist answer for this discount inference run.'
              : 'Mercenary did not get an approved specialist deliverable for this raid.'}
          </p>
          <p className="mercenary-message__note">
            {isLowSignalChatPrompt(lastSubmittedBrief ?? '')
              ? 'Short greetings usually stay conversational. Ask a concrete question or scoped task if you want specialist output.'
              : 'Try rephrasing the request more concretely, or switch to Mercenary raid if you want a scoped build workflow.'}
          </p>
        </ChatMessage>
      ) : null}

      {expandedArtifact ? (
        <ArtifactLightbox artifact={expandedArtifact} onClose={onCloseArtifact} />
      ) : null}
    </>
  );
}

function ArtifactGallery({
  artifacts,
  onOpenArtifact,
}: {
  artifacts: SubmissionArtifact[];
  onOpenArtifact: (artifact: SubmissionArtifact) => void;
}) {
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

function ArtifactCard({
  artifact,
  onOpenArtifact,
}: {
  artifact: SubmissionArtifact;
  onOpenArtifact: (artifact: SubmissionArtifact) => void;
}) {
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

function ArtifactLightbox({
  artifact,
  onClose,
}: {
  artifact: SubmissionArtifact;
  onClose: () => void;
}) {
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

function artifactKindLabel(artifact: SubmissionArtifact): string {
  return artifact.mimeType ? `${artifact.outputType} · ${artifact.mimeType}` : artifact.outputType;
}

function isRenderableImageArtifact(artifact: SubmissionArtifact): boolean {
  if (artifact.mimeType?.startsWith('image/')) {
    return true;
  }

  return artifact.mimeType == null && artifact.outputType === 'image';
}

function isRenderableVideoArtifact(artifact: SubmissionArtifact): boolean {
  if (artifact.mimeType?.startsWith('video/')) {
    return true;
  }

  return artifact.mimeType == null && artifact.outputType === 'video';
}

function parseBundleArtifact(artifact: SubmissionArtifact): BundleArtifactPreview | null {
  if (artifact.outputType !== 'bundle') {
    return null;
  }

  const payload = decodeArtifactPayload(artifact.uri);
  if (!payload) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload) as {
      artifactId?: string;
      files?: Array<{
        relativePath?: string;
        mimeType?: string;
        bytes?: number;
        sha256?: string;
        data?: string;
      }>;
    };
    const files = Array.isArray(parsed.files)
      ? parsed.files
          .filter(
            (
              file
            ): file is {
              relativePath: string;
              mimeType: string;
              bytes: number;
              sha256: string;
              data: string;
            } =>
              typeof file?.relativePath === 'string' &&
              typeof file?.mimeType === 'string' &&
              typeof file?.bytes === 'number' &&
              typeof file?.sha256 === 'string' &&
              typeof file?.data === 'string'
          )
          .map((file) => ({
            relativePath: file.relativePath,
            mimeType: file.mimeType,
            bytes: file.bytes,
            sha256: file.sha256,
            uri: `data:${file.mimeType};base64,${file.data}`,
          }))
      : [];

    return {
      artifactId: typeof parsed.artifactId === 'string' ? parsed.artifactId : artifact.label,
      files,
    };
  } catch {
    return null;
  }
}

function decodeArtifactPayload(uri: string): string | null {
  const match = uri.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,(.*)$/s);
  if (!match) {
    return null;
  }

  const [, , isBase64, body] = match;
  try {
    return isBase64 ? atob(body) : decodeURIComponent(body);
  } catch {
    return null;
  }
}

function buildArtifactDownloadName(artifact: SubmissionArtifact): string {
  const extension = extensionForMimeType(artifact.mimeType, artifact.outputType);
  return `${slugifyLabel(artifact.label, artifact.outputType)}.${extension}`;
}

function buildBundleFileDownloadName(path: string): string {
  const clean = path.trim().replace(/^\/+/, '');
  return clean.length > 0 ? (clean.split('/').pop() ?? clean) : 'artifact';
}

function extensionForMimeType(mimeType: string | undefined, fallback: string): string {
  switch (mimeType) {
    case 'image/gif':
      return 'gif';
    case 'image/png':
      return 'png';
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    case 'video/mp4':
      return 'mp4';
    case 'video/webm':
      return 'webm';
    case 'application/json':
      return 'json';
    case 'application/x-subrip':
      return 'srt';
    case 'text/markdown; charset=utf-8':
      return 'md';
    default:
      return fallback === 'bundle' ? 'json' : 'txt';
  }
}

function slugifyLabel(value: string, fallback: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}
