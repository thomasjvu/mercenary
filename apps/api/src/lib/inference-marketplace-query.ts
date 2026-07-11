import { providerMatchesMarketplaceConstraints } from '@bossraid/provider-registry';
import type { ProviderProfile, ProviderVerificationStatus } from '@bossraid/shared-types';
import type { MarketplaceQueryParams } from './marketplace-query.js';
import { STRICT_PRIVATE_PRIVACY_FEATURES } from './inference-marketplace-policy.js';
import {
  readProviderMarketRateUsd,
  resolveProviderMarketModelId,
} from './inference-marketplace-rates.js';

export function providerMatchesMarketplaceQuery(
  provider: ProviderProfile,
  options: MarketplaceQueryParams = {}
): boolean {
  if (!resolveProviderMarketModelId(provider)) {
    return false;
  }

  if (
    typeof options.maxBudgetUsd === 'number' &&
    readProviderMarketRateUsd(provider) > options.maxBudgetUsd
  ) {
    return false;
  }

  return providerMatchesMarketplaceConstraints(
    provider,
    {
      allowedModelIds: options.modelId ? [options.modelId] : undefined,
      allowedModelProviders: options.modelProvider ? [options.modelProvider] : undefined,
      allowedAgentFrameworks: options.agentFramework ? [options.agentFramework] : undefined,
      requiredVerificationStatus: options.verificationStatus as
        | ProviderVerificationStatus
        | undefined,
      privacyMode: options.privacyMode === 'strict' ? 'strict' : undefined,
      requirePrivacyFeatures:
        options.privacyMode === 'strict' ? [...STRICT_PRIVATE_PRIVACY_FEATURES] : undefined,
      onlineOnly: false,
    },
    { skipFreshnessCheck: true }
  );
}

export function filterEligibleMarketplaceProviders(
  providers: ProviderProfile[],
  options: MarketplaceQueryParams = {}
): ProviderProfile[] {
  return providers.filter((provider) => providerMatchesMarketplaceQuery(provider, options));
}
