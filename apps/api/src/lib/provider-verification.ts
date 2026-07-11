import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import { probeProviderHealth } from '@bossraid/provider-sdk';
import type {
  ProviderHealthStatus,
  ProviderProfile,
  ProviderRegistrationInput,
} from '@bossraid/shared-types';
import type { ApiControlState } from '../control-state.js';
import {
  isHostedInferenceProvider,
  probeHostedInferenceProviderHealth,
} from './inference-gateway.js';

export function buildProviderVerificationFromHealth(
  provider: ProviderProfile,
  health: ProviderHealthStatus
): NonNullable<ProviderProfile['verification']> {
  const apiVerified = health.reachable === true && health.ready === true && !health.missing?.length;
  const frameworkVerified =
    provider.agentFramework == null || health.agentFramework === provider.agentFramework;
  const modelProviderVerified =
    provider.modelProvider == null || health.modelProvider === provider.modelProvider;
  const modelVerified = provider.modelId == null || health.model === provider.modelId;
  const verified = apiVerified && frameworkVerified && modelProviderVerified && modelVerified;
  const notes = [
    apiVerified ? 'health_ready' : 'health_not_ready',
    provider.agentFramework && health.agentFramework == null ? 'framework_not_reported' : null,
    provider.modelProvider && health.modelProvider == null ? 'model_provider_not_reported' : null,
    provider.modelId && health.model == null ? 'model_not_reported' : null,
    frameworkVerified ? null : 'framework_mismatch',
    modelProviderVerified ? null : 'model_provider_mismatch',
    modelVerified ? null : 'model_mismatch',
    health.error ? `health_error:${health.error}` : null,
  ].filter((note): note is string => Boolean(note));

  return {
    status: verified ? 'verified' : 'failed',
    checkedAt: new Date().toISOString(),
    apiVerified,
    frameworkVerified,
    modelVerified: modelProviderVerified && modelVerified,
    notes,
  };
}

export function buildProviderVerificationRegistrationInput(
  provider: ProviderProfile,
  verification: NonNullable<ProviderProfile['verification']>,
  health?: ProviderHealthStatus
): ProviderRegistrationInput {
  return {
    agentId: provider.agentId ?? provider.providerId,
    name: provider.displayName,
    description: provider.description,
    endpoint: provider.endpoint,
    capabilities: provider.specializations,
    supportedLanguages: provider.supportedLanguages,
    supportedFrameworks: provider.supportedFrameworks,
    outputTypes: provider.outputTypes,
    modelFamily: provider.modelFamily,
    agentFramework: health?.agentFramework ?? provider.agentFramework,
    modelProvider: health?.modelProvider ?? provider.modelProvider,
    modelId: typeof health?.model === 'string' ? health.model : (provider.modelId ?? undefined),
    maxConcurrency: provider.maxConcurrency,
    source: provider.source,
    privacy: provider.privacy,
    erc8004: provider.erc8004,
    trust: provider.trust,
    pricing: provider.pricing ?? {
      mode: 'task',
      currency: 'USD',
      pricePerTaskUsd: provider.pricePerTaskUsd,
    },
    auth: provider.auth,
    verification,
    reputation: provider.reputation,
    harnessProfile: health?.harnessProfile ?? provider.harnessProfile,
    marketplaceOfferStatus: provider.marketplaceOfferStatus,
  };
}

export async function probeProviderHealthForRegistration(
  provider: ProviderProfile,
  options?: { controlState?: ApiControlState }
): Promise<ProviderHealthStatus> {
  if (options?.controlState && isHostedInferenceProvider(provider)) {
    return probeHostedInferenceProviderHealth(options.controlState, provider);
  }
  return probeProviderHealth(provider);
}

export async function verifyProviderFromHealth(
  orchestrator: BossRaidOrchestrator,
  provider: ProviderProfile,
  health: ProviderHealthStatus
): Promise<ProviderProfile> {
  const verification = buildProviderVerificationFromHealth(provider, health);
  return orchestrator.upsertRegisteredProvider(
    buildProviderVerificationRegistrationInput(provider, verification, health),
    { allowTakeover: false }
  );
}

export async function verifyProviderByHealthProbe(
  orchestrator: BossRaidOrchestrator,
  provider: ProviderProfile,
  options?: { controlState?: ApiControlState }
): Promise<{ provider: ProviderProfile; health: ProviderHealthStatus }> {
  const health = await probeProviderHealthForRegistration(provider, options);
  const verifiedProvider = await verifyProviderFromHealth(orchestrator, provider, health);
  return { provider: verifiedProvider, health };
}
