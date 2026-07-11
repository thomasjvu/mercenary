import { readTeeSocketPath } from '@bossraid/constants';
import type { PrivacyAttestation, PrivacyFeatureKey } from '@bossraid/shared-types';
import { buildPrivacyAttestation, verifyPhalaTeeAttestation } from '@bossraid/privacy-engine';

export interface PrivacyFeaturesConfig {
  featuresClaimed: PrivacyFeatureKey[];
  teeSocketPath?: string;
  externalApiCalls?: string[];
  dataRetained?: boolean;
  harnessProfile?: import('@bossraid/shared-types').HarnessProfile;
}

const PROVIDER_TEE_CACHE_TTL_MS = 10 * 60 * 1000;
const providerTeeCache = new Map<
  string,
  { result: Awaited<ReturnType<typeof verifyPhalaTeeAttestation>>; expiresAt: number }
>();

export async function buildProviderPrivacyAttestation(
  providerId: string,
  raidId: string,
  config: PrivacyFeaturesConfig
): Promise<PrivacyAttestation | undefined> {
  const socketPath = config.teeSocketPath ?? readTeeSocketPath(process.env);
  const teeResult = await verifyPhalaTeeAttestation(
    providerId,
    socketPath,
    providerTeeCache,
    PROVIDER_TEE_CACHE_TTL_MS,
    {
      reportData: JSON.stringify({
        providerId,
        raidId,
        harness: config.harnessProfile
          ? {
              lane: config.harnessProfile.lane,
              installation: config.harnessProfile.installation,
              compositionHash: config.harnessProfile.compositionHash,
              framework: config.harnessProfile.framework,
              planProvider: config.harnessProfile.planProvider,
              imageDigest: config.harnessProfile.imageDigest,
              skills: config.harnessProfile.skills.map((skill) => skill.id),
            }
          : null,
      }),
      runtimeMode: process.env.BOSSRAID_TEE_RUNTIME_MODE ?? 'phala-cvm-gpu',
      skipCloudVerify: process.env.BOSSRAID_HOST_TEE_SKIP_CLOUD_VERIFY === '1',
    }
  );
  const featuresVerified: PrivacyFeatureKey[] = [];
  if (teeResult.valid && config.featuresClaimed.includes('tee_attested')) {
    featuresVerified.push('tee_attested');
  }

  return buildPrivacyAttestation({
    providerId,
    raidId,
    featuresClaimed: config.featuresClaimed,
    featuresVerified,
    teeAttestation: teeResult,
    externalApiCalls: config.externalApiCalls,
    dataRetained: config.dataRetained,
  });
}
