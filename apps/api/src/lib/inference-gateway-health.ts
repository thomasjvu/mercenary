import type { ProviderHealthStatus, ProviderProfile } from '@bossraid/shared-types';
import type { UpstreamProviderId } from '@bossraid/constants';
import { isUpstreamProviderId } from '@bossraid/constants';
import type { ApiControlState } from '../control-state.js';

export function resolveHostedProviderUpstream(
  provider: ProviderProfile
): UpstreamProviderId | undefined {
  if (provider.source?.targetType && isUpstreamProviderId(provider.source.targetType)) {
    return provider.source.targetType;
  }
  if (provider.source?.type === 'venice_hosted') {
    return 'venice';
  }
  if (provider.modelProvider && isUpstreamProviderId(provider.modelProvider)) {
    return provider.modelProvider;
  }
  return undefined;
}

export function isHostedInferenceProvider(provider: ProviderProfile): boolean {
  return provider.source?.type === 'inference_hosted' || provider.source?.type === 'venice_hosted';
}

export function isVeniceHostedProvider(provider: ProviderProfile): boolean {
  return (
    isHostedInferenceProvider(provider) && resolveHostedProviderUpstream(provider) === 'venice'
  );
}

export function probeHostedInferenceProviderHealth(
  controlState: ApiControlState,
  provider: ProviderProfile
): ProviderHealthStatus {
  const wallet = provider.source?.externalRef;
  const upstream = resolveHostedProviderUpstream(provider);
  const configured =
    wallet && upstream ? Boolean(controlState.readSellerUpstreamConfig(wallet, upstream)) : false;

  return {
    providerId: provider.providerId,
    providerName: provider.displayName,
    endpoint: provider.endpoint,
    reachable: configured,
    ready: configured,
    statusCode: configured ? 200 : 503,
    missing: configured
      ? undefined
      : [`BOSSRAID_${(upstream ?? 'UPSTREAM').toUpperCase()}_API_KEY`],
    agentFramework: provider.agentFramework ?? 'custom',
    modelProvider: provider.modelProvider ?? upstream ?? 'unknown',
    model: provider.modelId ?? null,
    error: configured
      ? undefined
      : `${upstream ?? 'Upstream'} API key is not configured for this seller.`,
  };
}
