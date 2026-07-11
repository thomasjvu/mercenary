import type { UpstreamProviderId } from '@bossraid/constants';
import { isUpstreamProviderId } from '@bossraid/constants';
import type { Provider } from '../api/client.js';

type ProviderSource = Provider['source'] & { targetType?: string };

export function isHostedInferenceOffer(provider: Pick<Provider, 'source'>): boolean {
  const type = provider.source?.type;
  return type === 'inference_hosted' || type === 'venice_hosted' || type === 'harness_hosted';
}

export function resolveHostedOfferUpstream(
  source: ProviderSource | undefined,
  modelProvider?: string
): UpstreamProviderId {
  if (source?.targetType && isUpstreamProviderId(source.targetType)) {
    return source.targetType;
  }
  if (source?.type === 'venice_hosted') {
    return 'venice';
  }
  if (modelProvider && isUpstreamProviderId(modelProvider)) {
    return modelProvider;
  }
  return 'venice';
}

export function filterHostedInferenceOffers(providers: Provider[]): Provider[] {
  return providers.filter(isHostedInferenceOffer);
}

export function formatHostedOfferPricing(provider: Provider): string {
  if (provider.pricing?.mode === 'token_metered') {
    return `$${provider.pricing.pricePer1mInputTokensUsd?.toFixed(3) ?? '0'} / $${provider.pricing.pricePer1mOutputTokensUsd?.toFixed(3) ?? '0'} per M`;
  }
  return `$${provider.pricePerTaskUsd.toFixed(2)} per task`;
}
