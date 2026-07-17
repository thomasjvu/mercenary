/**
 * Buyer-facing privacy taxonomy for marketplace models.
 * Distinct from host Phala CVM TEE (deployment) and from strict-raid privacy features.
 */

export type MarketplacePrivacyTier = 'standard' | 'anonymous_private' | 'upstream_tee' | 'e2ee';

export type MarketplacePrivacyTierInfo = {
  tier: MarketplacePrivacyTier;
  /** Short buyer-facing label */
  label: string;
  /** One-line meaning */
  summary: string;
};

const TIER_INFO: Record<MarketplacePrivacyTier, Omit<MarketplacePrivacyTierInfo, 'tier'>> = {
  standard: {
    label: 'Standard',
    summary: 'Marketplace-routed API inference without special privacy claims.',
  },
  anonymous_private: {
    label: 'Anonymous / private',
    summary:
      'Not tied to a specific end user at the model vendor (traffic uses platform or seller keys). Not hardware TEE.',
  },
  upstream_tee: {
    label: 'Upstream TEE',
    summary: 'Model is claimed or verified to run in a hardware TEE at the upstream vendor.',
  },
  e2ee: {
    label: 'E2EE',
    summary: 'End-to-end encrypted inference path when strict privacy mode is used.',
  },
};

/**
 * Derive marketplace privacy tier from catalog flags.
 * Prefer e2ee > upstream TEE > anonymous/private > standard.
 */
export function resolveMarketplacePrivacyTier(input: {
  privacy?: string;
  teeAttested?: boolean;
  e2ee?: boolean;
  modelProvider?: string;
}): MarketplacePrivacyTier {
  if (input.e2ee) {
    return 'e2ee';
  }
  if (input.teeAttested || input.privacy === 'tee') {
    return 'upstream_tee';
  }

  const privacy = (input.privacy ?? '').toLowerCase();
  if (privacy === 'private' || privacy === 'anonymized' || privacy === 'anonymous') {
    return 'anonymous_private';
  }

  // First-party API hosts without TEE reports still benefit from marketplace indirection.
  const provider = (input.modelProvider ?? '').toLowerCase();
  if (
    provider === 'xai' ||
    provider === 'anthropic' ||
    provider === 'darkbloom' ||
    provider === 'zai'
  ) {
    return 'anonymous_private';
  }

  return 'standard';
}

export function describeMarketplacePrivacyTier(
  tier: MarketplacePrivacyTier
): MarketplacePrivacyTierInfo {
  return { tier, ...TIER_INFO[tier] };
}

/** Host Phala CVM is a separate claim from model privacy tiers. */
export const HOST_TEE_PRIVACY_NOTE =
  'Host Phala CVM TEE proves where Boss Raid runs. It does not prove that remote model APIs (e.g. api.x.ai) ran in TEE. Non-TEE marketplace models are anonymous at the vendor when traffic uses platform/seller keys, not TEE-private.';
