import { INFERENCE_MODEL_CATALOG, isUpstreamProviderId } from '@bossraid/constants';
import type { UpstreamProviderId } from '@bossraid/constants';
import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import { parseProviderRegistrationInput } from '@bossraid/api-contracts';
import type { ProviderProfile } from '@bossraid/shared-types';
import { readPlatformUpstreamApiKey } from './upstream/credentials.js';
import { buildHostedProviderRegistration } from './upstream-offers.js';
import { resolveInferenceGatewayProviderEndpoint } from './inference-gateway.js';

/** Matches web featured strip; only models with catalog rates are published. */
export const PLATFORM_LIQUIDITY_FEATURED_MODEL_IDS = [
  'anthropic/claude-opus-4-5',
  'anthropic/claude-sonnet-4-5',
  'openai-gpt-55',
  'google-gemma-4-31b-it',
] as const;

/** Synthetic externalRef for platform-owned hosted seats (uses BOSSRAID_*_API_KEY). */
export const PLATFORM_LIQUIDITY_WALLET = 'platform';

export type PlatformLiquidityBootstrapResult = {
  object: 'platform_liquidity_bootstrap';
  attempted: number;
  published: Array<{ modelId: string; providerId: string; upstream: UpstreamProviderId }>;
  skipped: Array<{ modelId: string; reason: string }>;
};

export function listPlatformLiquidityCandidates(env: NodeJS.ProcessEnv = process.env): Array<{
  modelId: string;
  upstream: UpstreamProviderId;
  hasPlatformKey: boolean;
}> {
  const out: Array<{ modelId: string; upstream: UpstreamProviderId; hasPlatformKey: boolean }> = [];
  for (const modelId of PLATFORM_LIQUIDITY_FEATURED_MODEL_IDS) {
    const entry = INFERENCE_MODEL_CATALOG.find((row) => row.modelId === modelId);
    if (!entry || !isUpstreamProviderId(entry.modelProvider)) {
      continue;
    }
    out.push({
      modelId,
      upstream: entry.modelProvider,
      hasPlatformKey: Boolean(readPlatformUpstreamApiKey(entry.modelProvider, env)),
    });
  }
  return out;
}

/**
 * Register chat-lane hosted offers for featured models when the matching platform
 * BOSSRAID_*_API_KEY is present. Gateway resolves keys via PLATFORM_LIQUIDITY_WALLET.
 */
export async function bootstrapPlatformLiquidity(input: {
  orchestrator: BossRaidOrchestrator;
  env?: NodeJS.ProcessEnv;
  discountPercent?: number;
}): Promise<PlatformLiquidityBootstrapResult> {
  const env = input.env ?? process.env;
  const discountPercent = input.discountPercent ?? 0;
  const published: PlatformLiquidityBootstrapResult['published'] = [];
  const skipped: PlatformLiquidityBootstrapResult['skipped'] = [];

  for (const candidate of listPlatformLiquidityCandidates(env)) {
    if (!candidate.hasPlatformKey) {
      skipped.push({
        modelId: candidate.modelId,
        reason: `missing BOSSRAID_${candidate.upstream.toUpperCase()}_API_KEY`,
      });
      continue;
    }

    const registration = buildHostedProviderRegistration({
      provider: candidate.upstream,
      wallet: PLATFORM_LIQUIDITY_WALLET,
      modelId: candidate.modelId,
      discountPercent,
      payoutWallet: env.BOSSRAID_X402_PAY_TO?.trim() || PLATFORM_LIQUIDITY_WALLET,
      env,
      lane: 'chat',
    });
    if (!registration) {
      skipped.push({ modelId: candidate.modelId, reason: 'unsupported_catalog_model' });
      continue;
    }

    // Stable platform provider id for featured liquidity (overrides seller slug).
    const providerId = `platform-${candidate.upstream}-${candidate.modelId
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()}`.slice(0, 96);
    registration.agentId = providerId;
    registration.endpoint = resolveInferenceGatewayProviderEndpoint(providerId, env);
    registration.name = `${registration.name ?? candidate.modelId} (platform)`;

    const profile = await input.orchestrator.upsertRegisteredProvider(
      parseProviderRegistrationInput(registration),
      { allowTakeover: true }
    );
    published.push({
      modelId: candidate.modelId,
      providerId: profile.providerId,
      upstream: candidate.upstream,
    });
  }

  return {
    object: 'platform_liquidity_bootstrap',
    attempted: PLATFORM_LIQUIDITY_FEATURED_MODEL_IDS.length,
    published,
    skipped,
  };
}

export function resolveHostedUpstreamApiKey(input: {
  controlState: {
    readSellerUpstreamApiKey: (
      wallet: string,
      provider: UpstreamProviderId,
      env?: NodeJS.ProcessEnv
    ) => string | undefined;
  };
  wallet: string;
  upstream: UpstreamProviderId;
  env?: NodeJS.ProcessEnv;
}): string | undefined {
  const env = input.env ?? process.env;
  const sellerKey = input.controlState.readSellerUpstreamApiKey(input.wallet, input.upstream, env);
  if (sellerKey) {
    return sellerKey;
  }
  if (input.wallet === PLATFORM_LIQUIDITY_WALLET) {
    return readPlatformUpstreamApiKey(input.upstream, env);
  }
  return undefined;
}

export function isPlatformLiquidityProvider(provider: Pick<ProviderProfile, 'source'>): boolean {
  return provider.source?.externalRef === PLATFORM_LIQUIDITY_WALLET;
}
