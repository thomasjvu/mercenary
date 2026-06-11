import type { Erc8004VerificationStatus } from './types.js';

export type ArtifactLike = {
  outputType?: string;
  mimeType?: string | null;
};

export type { Erc8004VerificationStatus };

export type ProviderErc8004Like = {
  erc8004?: {
    registrationTx?: string;
    verification?: {
      status?: Erc8004VerificationStatus;
      registrationTxFound?: boolean;
      operatorMatchesOwner?: boolean;
    };
  };
};

export function hasErc8004Registration(provider: ProviderErc8004Like | undefined): boolean {
  return (
    typeof provider?.erc8004?.registrationTx === 'string' &&
    provider.erc8004.registrationTx.length > 0
  );
}

export function buildErc8004ProofLabel(
  verificationStatus: Erc8004VerificationStatus | undefined,
  registered: boolean,
  options: { style?: 'short' | 'long' } = {}
): string {
  const prefix = options.style === 'long' ? 'erc8004' : '8004';

  switch (verificationStatus) {
    case 'verified':
      return `${prefix} verified`;
    case 'partial':
      return `${prefix} partial`;
    case 'failed':
      return `${prefix} failed`;
    case 'error':
      return `${prefix} error`;
    default:
      return registered ? `${prefix} registered` : `${prefix} pending`;
  }
}

export function isRenderableImageArtifact(artifact: ArtifactLike): boolean {
  if (artifact.mimeType?.startsWith('image/')) {
    return true;
  }

  return artifact.mimeType == null && artifact.outputType === 'image';
}

export function isRenderableVideoArtifact(artifact: ArtifactLike): boolean {
  if (artifact.mimeType?.startsWith('video/')) {
    return true;
  }

  return artifact.mimeType == null && artifact.outputType === 'video';
}
