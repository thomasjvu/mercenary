export const UPSTREAM_PROVIDER_IDS = [
  'venice',
  'redpill',
  'near',
  'chutes',
  'phala',
  'xai',
  'zai',
  'anthropic',
  'darkbloom',
] as const;

export type UpstreamProviderId = (typeof UPSTREAM_PROVIDER_IDS)[number];

export type UpstreamProviderConfig = {
  id: UpstreamProviderId;
  displayName: string;
  upstreamBase: string;
  attestationVendor: UpstreamProviderId;
  supportsE2ee: boolean;
};

export const UPSTREAM_PROVIDER_CONFIG: Record<UpstreamProviderId, UpstreamProviderConfig> = {
  venice: {
    id: 'venice',
    displayName: 'Venice',
    upstreamBase: 'https://api.venice.ai/api/v1',
    attestationVendor: 'venice',
    supportsE2ee: true,
  },
  redpill: {
    id: 'redpill',
    displayName: 'Redpill',
    upstreamBase: 'https://api.redpill.ai/v1',
    attestationVendor: 'redpill',
    supportsE2ee: true,
  },
  near: {
    id: 'near',
    displayName: 'NEAR AI',
    upstreamBase: 'https://cloud-api.near.ai/v1',
    attestationVendor: 'near',
    supportsE2ee: true,
  },
  chutes: {
    id: 'chutes',
    displayName: 'Chutes.ai',
    // OpenAI-compatible agent/LLM gateway (tools, chat). Management/TEE still on api.chutes.ai.
    upstreamBase: 'https://llm.chutes.ai/v1',
    attestationVendor: 'chutes',
    supportsE2ee: false,
  },
  phala: {
    id: 'phala',
    displayName: 'Phala Cloud',
    upstreamBase: 'https://cloud-api.phala.network/api/v1',
    attestationVendor: 'phala',
    supportsE2ee: true,
  },
  xai: {
    id: 'xai',
    displayName: 'xAI (Grok)',
    upstreamBase: 'https://api.x.ai/v1',
    attestationVendor: 'xai',
    supportsE2ee: false,
  },
  zai: {
    id: 'zai',
    displayName: 'Z.ai (GLM)',
    // Default to GLM Coding Plan OpenAI-compatible endpoint (subscription quota).
    // Standard token API: https://api.z.ai/api/paas/v4
    upstreamBase: 'https://api.z.ai/api/coding/paas/v4',
    attestationVendor: 'zai',
    supportsE2ee: false,
  },
  anthropic: {
    id: 'anthropic',
    displayName: 'Anthropic (Claude)',
    // OpenAI-compatible surface for Claude models (Messages API also available).
    upstreamBase: 'https://api.anthropic.com/v1',
    attestationVendor: 'anthropic',
    supportsE2ee: false,
  },
  darkbloom: {
    id: 'darkbloom',
    displayName: 'Darkbloom',
    // Private inference on verified Apple Silicon. OpenAI-compatible.
    // @see https://www.darkbloom.dev/#api
    upstreamBase: 'https://api.darkbloom.dev/v1',
    attestationVendor: 'darkbloom',
    supportsE2ee: false,
  },
};

export function isUpstreamProviderId(value: string): value is UpstreamProviderId {
  return (UPSTREAM_PROVIDER_IDS as readonly string[]).includes(value);
}

export function resolveUpstreamProviderConfig(
  provider: string
): UpstreamProviderConfig | undefined {
  return isUpstreamProviderId(provider) ? UPSTREAM_PROVIDER_CONFIG[provider] : undefined;
}

export function getUpstreamDisplayName(provider: UpstreamProviderId): string {
  return UPSTREAM_PROVIDER_CONFIG[provider].displayName;
}
