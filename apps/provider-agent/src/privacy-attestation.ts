import type {
  PrivacyAttestation,
  PrivacyFeatureKey,
  TeeAttestationResult,
} from '@bossraid/shared-types';
import { verifyPhalaTeeAttestation } from '@bossraid/privacy-engine';

export interface PrivacyFeaturesConfig {
  featuresClaimed: PrivacyFeatureKey[];
  teeSocketPath?: string;
}

function buildDeclaration(
  providerId: string,
  raidId: string,
  featuresClaimed: PrivacyFeatureKey[],
  teeResult: TeeAttestationResult
): string {
  const parts = [
    providerId,
    raidId,
    featuresClaimed.join(','),
    teeResult.valid ? 'attested' : 'unattested',
    '0',
    'false',
  ];
  return `PRIVACY_DECLARATION:${parts.join('|')}`;
}

export async function buildProviderPrivacyAttestation(
  providerId: string,
  raidId: string,
  config: PrivacyFeaturesConfig
): Promise<PrivacyAttestation | undefined> {
  const socketPath =
    config.teeSocketPath ?? process.env.BOSSRAID_TEE_SOCKET_PATH ?? '/var/run/tappd.sock';
  const teeResult = await verifyPhalaTeeAttestation(providerId, socketPath, undefined, undefined, {
    reportData: JSON.stringify({ providerId, raidId }),
    runtimeMode: process.env.BOSSRAID_TEE_RUNTIME_MODE ?? 'phala-cvm-gpu',
  });
  const featuresVerified: PrivacyFeatureKey[] = [];
  if (teeResult.valid && config.featuresClaimed.includes('signed_outputs')) {
    featuresVerified.push('signed_outputs');
  }
  if (teeResult.valid && config.featuresClaimed.includes('no_data_retention')) {
    featuresVerified.push('no_data_retention');
  }
  if (teeResult.valid && config.featuresClaimed.includes('tee_attested')) {
    featuresVerified.push('tee_attested');
  }

  const declaration = buildDeclaration(providerId, raidId, config.featuresClaimed, teeResult);
  return {
    providerId,
    raidId,
    submittedAt: new Date().toISOString(),
    featuresClaimed: config.featuresClaimed,
    featuresVerified,
    teeAttestation: teeResult,
    externalApiCalls: [],
    dataRetained: false,
    signedDeclaration: declaration,
  };
}
