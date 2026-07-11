import type { UpstreamProviderId } from '@bossraid/constants';

const PROVIDER_INFERENCE_MOCK_KEYS: Record<UpstreamProviderId, string> = {
  venice: 'BOSSRAID_VENICE_MOCK',
  redpill: 'BOSSRAID_REDPILL_MOCK',
  near: 'BOSSRAID_NEAR_MOCK',
  chutes: 'BOSSRAID_CHUTES_MOCK',
  phala: 'BOSSRAID_PHALA_MOCK',
  xai: 'BOSSRAID_XAI_MOCK',
  zai: 'BOSSRAID_ZAI_MOCK',
};

export function isProviderInferenceMock(
  provider: UpstreamProviderId,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (env.BOSSRAID_UPSTREAM_MOCK === '1') {
    return true;
  }
  return env[PROVIDER_INFERENCE_MOCK_KEYS[provider]] === '1';
}

export function isProviderTeeMock(
  provider: UpstreamProviderId,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.BOSSRAID_UPSTREAM_TEE_MOCK === '1' || isProviderInferenceMock(provider, env);
}

export function mockE2eeContent(modelId: string): string {
  return `mock-e2ee:${modelId}`;
}
