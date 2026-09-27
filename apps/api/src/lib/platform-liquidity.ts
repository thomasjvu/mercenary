import { fetchUpstreamModels, mergeUpstreamCatalogModelsForProvider } from './upstream/index.js';
import { verifyHostedModel } from './upstream/eligibility.js';
import {
  INFERENCE_MODEL_CATALOG,
  getInferenceCatalogEntry,
  isUpstreamProviderId,
} from '@bossraid/constants';
import type { UpstreamProviderId } from '@bossraid/constants';
import type { BossRaidOrchestrator } from '@bossraid/orchestrator';
import { parseProviderRegistrationInput } from '@bossraid/api-contracts';
import type { ProviderProfile } from '@bossraid/shared-types';
import { readPlatformUpstreamApiKey } from './upstream/credentials.js';
import { buildHostedProviderRegistration } from './upstream-offers.js';
import { resolveInferenceGatewayProviderEndpoint } from './inference-gateway.js';

/**
 * When BOSSRAID_<PROVIDER>_API_KEY is set, publish a platform seat for every
 * priced catalog row that passes live availability and completion checks.
 * @see https://docs.venice.ai/models/overview
 * @see https://chutes.ai/models?type=llm
 * @see https://cloud.near.ai/#models
 * @see https://phala.com/models
 * @see https://redpill.ai/models
 * @see https://www.darkbloom.dev/#api
 * @see https://docs.x.ai/developers/pricing
 * @see https://claude.com/pricing
 */
export const PLATFORM_LIQUIDITY_FULL_CATALOG_PROVIDERS = [
  'venice',
  'chutes',
  'near',
  'phala',
  'redpill',
  'darkbloom',
  'nebius',
  'openai',
  'xai',
  'zai',
  'anthropic',
] as const satisfies readonly UpstreamProviderId[];

/** Synthetic externalRef for platform-owned hosted seats (uses BOSSRAID_*_API_KEY). */
export const PLATFORM_LIQUIDITY_WALLET = 'platform';

export type PlatformLiquidityBootstrapResult = {
  object: 'platform_liquidity_bootstrap';
  attempted: number;
  published: Array<{ modelId: string; providerId: string; upstream: UpstreamProviderId }>;
  skipped: Array<{ modelId: string; reason: string }>;
  removed: string[];
  paused: string[];
};

/** Stable ordered model ids for platform liquidity bootstrap. */
export function listPlatformLiquidityModelIds(): string[] {
  const ids = new Set<string>();
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
    const entry = getInferenceCatalogEntry(modelId);
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

  const paused: string[] = [];
  const existing = input.orchestrator.listProviders().filter(isPlatformLiquidityProvider);
  const pause = async (upstream: UpstreamProviderId, modelId?: string) => {
    for (const profile of existing) {
      if (profile.source?.targetType !== upstream || (modelId && profile.modelId !== modelId))
        continue;
      await input.orchestrator.pauseRegisteredProvider(
        profile.providerId,
        'Upstream availability or completion check failed.'
      );
      paused.push(profile.providerId);
    }
  };
  for (const upstream of PLATFORM_LIQUIDITY_FULL_CATALOG_PROVIDERS) {
    const apiKey = readPlatformUpstreamApiKey(upstream, env);
    const providerCandidates = candidates.filter((c) => c.upstream === upstream);
    if (!apiKey) {
      for (const candidate of providerCandidates)
        skipped.push({
          modelId: candidate.modelId,
          reason: `missing BOSSRAID_${upstream.toUpperCase()}_API_KEY`,
        });
      await pause(upstream);
      continue;
    }
    let models;
    try {
      models = mergeUpstreamCatalogModelsForProvider(
        upstream,
        await fetchUpstreamModels(upstream, apiKey, { env })
      );
    } catch {
      for (const candidate of providerCandidates)
        skipped.push({ modelId: candidate.modelId, reason: 'upstream_models_unavailable' });
      await pause(upstream);
      continue;
    }
    for (const previous of existing.filter((p) => p.source?.targetType === upstream)) {
      if (!models.some((m) => m.modelId === previous.modelId && m.offerable))
        await pause(upstream, previous.modelId);
    }
    // Four completion probes at a time, bounded independently of catalog size.
    let cursor = 0;
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        while (cursor < models.length) {
          const model = models[cursor++];
          if (!model.offerable) {
            skipped.push({ modelId: model.modelId, reason: model.state });
            continue;
          }
          try {
            await verifyHostedModel({
              provider: upstream,
              apiKey,
              modelId: model.modelId,
              upstreamModelId: model.upstreamModelId,
              env,
            });
          } catch {
            skipped.push({ modelId: model.modelId, reason: 'live_failed' });
            await pause(upstream, model.modelId);
            continue;
          }
          const registration = buildHostedProviderRegistration({
            provider: upstream,
            wallet: PLATFORM_LIQUIDITY_WALLET,
            modelId: model.modelId,
            discountPercent,
            payoutWallet: env.BOSSRAID_X402_PAY_TO?.trim() || PLATFORM_LIQUIDITY_WALLET,
            env,
            lane: 'chat',
          });
          if (!registration) {
            skipped.push({ modelId: model.modelId, reason: 'unsupported_catalog_model' });
            continue;
          }
          const providerId = `platform-${upstream}-${model.modelId
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase()}`.slice(0, 96);
          registration.agentId = providerId;
          registration.endpoint = resolveInferenceGatewayProviderEndpoint(providerId, env);
          registration.name = `${registration.name ?? model.modelId} (platform)`;
          if (registration.pricing) registration.pricing.upstreamModelId = model.upstreamModelId;
          registration.verification = {
            status: 'verified',
            checkedAt: new Date().toISOString(),
            apiVerified: true,
            modelVerified: true,
            frameworkVerified: true,
            notes: ['Live model list and completion probe passed.'],
          };
          const profile = await input.orchestrator.upsertRegisteredProvider(
            parseProviderRegistrationInput(registration),
            { allowTakeover: true }
          );
          published.push({ modelId: model.modelId, providerId: profile.providerId, upstream });
        }
      })
    );
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
    paused: [...new Set(paused)],
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
