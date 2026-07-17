import { INFERENCE_MODEL_CATALOG, isUpstreamProviderId } from '@bossraid/constants';
import type { UpstreamProviderId } from '@bossraid/constants';
import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import { parseProviderRegistrationInput } from '@bossraid/api-contracts';
import type { ProviderProfile } from '@bossraid/shared-types';
import { readPlatformUpstreamApiKey } from './upstream/credentials.js';
import { buildHostedProviderRegistration } from './upstream-offers.js';
import { resolveInferenceGatewayProviderEndpoint } from './inference-gateway.js';

/**
 * Explicit platform seats (always considered when catalog row + key exist).
 * xAI / Anthropic stay curated; Venice + Chutes use full catalog providers below.
 */
export const PLATFORM_LIQUIDITY_FEATURED_MODEL_IDS = [
  // xAI / Grok
  'grok-4.5',
  'grok-4.3',
  'grok-4.20-0309-reasoning',
  'grok-4.20-0309-non-reasoning',
  'grok-4.20-multi-agent-0309',
  'grok-build-0.1',
  'grok-4-1-fast-reasoning',
  'grok-4-1-fast-non-reasoning',
  // Anthropic first-party (namespaced; Venice also lists unprefixed claude-*)
  'anthropic/claude-opus-4-5',
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-haiku-4-5',
] as const;

/**
 * When BOSSRAID_<PROVIDER>_API_KEY is set, publish a platform seat for every
 * inference-catalog row from these upstreams (Venice text + Chutes LLMs).
 * @see https://docs.venice.ai/models/overview
 * @see https://chutes.ai/models?type=llm
 */
export const PLATFORM_LIQUIDITY_FULL_CATALOG_PROVIDERS = [
  'venice',
  'chutes',
] as const satisfies readonly UpstreamProviderId[];

/** Synthetic externalRef for platform-owned hosted seats (uses BOSSRAID_*_API_KEY). */
export const PLATFORM_LIQUIDITY_WALLET = 'platform';

export type PlatformLiquidityBootstrapResult = {
  object: 'platform_liquidity_bootstrap';
  attempted: number;
  published: Array<{ modelId: string; providerId: string; upstream: UpstreamProviderId }>;
  skipped: Array<{ modelId: string; reason: string }>;
  removed: string[];
};

/** Stable ordered model ids for platform liquidity bootstrap. */
export function listPlatformLiquidityModelIds(): string[] {
  const ids = new Set<string>(PLATFORM_LIQUIDITY_FEATURED_MODEL_IDS);
  const fullProviders = new Set<string>(PLATFORM_LIQUIDITY_FULL_CATALOG_PROVIDERS);
  for (const entry of INFERENCE_MODEL_CATALOG) {
    if (fullProviders.has(entry.modelProvider)) {
      ids.add(entry.modelId);
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export function listPlatformLiquidityCandidates(env: NodeJS.ProcessEnv = process.env): Array<{
  modelId: string;
  upstream: UpstreamProviderId;
  hasPlatformKey: boolean;
}> {
  const out: Array<{ modelId: string; upstream: UpstreamProviderId; hasPlatformKey: boolean }> = [];
  for (const modelId of listPlatformLiquidityModelIds()) {
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
 * Register chat-lane hosted offers when the matching platform BOSSRAID_*_API_KEY
 * is present. Gateway resolves keys via PLATFORM_LIQUIDITY_WALLET.
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
  const candidates = listPlatformLiquidityCandidates(env);

  for (const candidate of candidates) {
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

  const removed: string[] = [];
  const disabledIds = (env.BOSSRAID_DISABLED_PROVIDER_IDS ?? 'dottie,riko,gamma')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  for (const providerId of disabledIds) {
    const removedOne = await input.orchestrator.removeRegisteredProvider(providerId);
    if (removedOne) {
      removed.push(providerId);
    }
  }

  return {
    object: 'platform_liquidity_bootstrap',
    attempted: candidates.length,
    published,
    skipped,
    removed,
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
