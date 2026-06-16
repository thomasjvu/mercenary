import type { SubmissionArtifact } from '@bossraid/shared-types';

export type BundleArtifactFile = {
  relativePath: string;
  mimeType: string;
  bytes: number;
  sha256: string;
  uri: string;
};

export type BundleArtifactPreview = {
  artifactId: string;
  files: BundleArtifactFile[];
};

export function artifactKindLabel(artifact: SubmissionArtifact): string {
  return artifact.mimeType ? `${artifact.outputType} · ${artifact.mimeType}` : artifact.outputType;
}

export function isRenderableImageArtifact(artifact: SubmissionArtifact): boolean {
  if (artifact.mimeType?.startsWith('image/')) {
    return true;
  }

  return artifact.mimeType == null && artifact.outputType === 'image';
}

export function isRenderableVideoArtifact(artifact: SubmissionArtifact): boolean {
  if (artifact.mimeType?.startsWith('video/')) {
    return true;
  }

  return artifact.mimeType == null && artifact.outputType === 'video';
}

export function decodeArtifactPayload(uri: string): string | null {
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

export function parseBundleArtifact(artifact: SubmissionArtifact): BundleArtifactPreview | null {
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

export function buildArtifactDownloadName(artifact: SubmissionArtifact): string {
  const extension = extensionForMimeType(artifact.mimeType, artifact.outputType);
  return `${slugifyLabel(artifact.label, artifact.outputType)}.${extension}`;
}

export function buildBundleFileDownloadName(path: string): string {
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
