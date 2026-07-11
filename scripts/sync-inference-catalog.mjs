import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FEATURED_LIVE_MODEL_IDS = new Set([
  'phala/gemma-4-26b-a4b-uncensored',
  'venice-uncensored-1-2',
  'google-gemma-4-31b-it',
  'mistral-small-3-2-24b-instruct',
  'qwen3-5-9b',
  'deepseek-v3.2',
  'minimax-m27',
  'olafangensan-glm-4.7-flash-heretic',
  'e2ee-gemma-4-26b-a4b-uncensored-p',
  'openai-gpt-55',
  'zai-org/GLM-5.1-FP8',
  'tee-qwen3-5-122b-chutes',
  'grok-4.5',
  'grok-4-1-fast-reasoning',
  'glm-4.7',
  'glm-5-turbo',
  'chutes-deepseek-v3.2-tee',
  'chutes-glm-5.2-tee',
]);

const REDPILL_MODELS = [
  {
    modelId: 'redpill/phala-gemma-4-26b-a4b-uncensored',
    displayName: 'Phala Gemma 4 26B Uncensored (Redpill)',
    modelProvider: 'redpill',
    attestationVendor: 'redpill',
    upstream: 'phala/gemma-4-26b-a4b-uncensored',
    inputPer1mUsd: 0.15,
    outputPer1mUsd: 0.7,
    maxContextTokens: 66_000,
    privacy: 'tee',
    teeAttested: true,
    e2ee: false,
    signedOutputs: true,
    noDataRetention: true,
  },
];

const NEAR_MODELS = [
  {
    modelId: 'zai-org/GLM-5.1-FP8',
    displayName: 'GLM 5.1 FP8 (NEAR AI)',
    modelProvider: 'near',
    attestationVendor: 'near',
    upstream: 'zai-org/GLM-5.1-FP8',
    inputPer1mUsd: 0.35,
    outputPer1mUsd: 1.2,
    maxContextTokens: 128_000,
    privacy: 'tee',
    teeAttested: true,
    e2ee: true,
    signedOutputs: true,
    noDataRetention: true,
  },
];

const CHUTES_MODELS = [
  {
    modelId: 'tee-qwen3-5-122b-chutes',
    displayName: 'TEE Qwen3.5 122B (Chutes)',
    modelProvider: 'chutes',
    attestationVendor: 'chutes',
    upstream: 'tee-qwen3-5-122b',
    inputPer1mUsd: 0.4,
    outputPer1mUsd: 1.5,
    maxContextTokens: 128_000,
    privacy: 'tee',
    teeAttested: true,
    e2ee: false,
    signedOutputs: true,
    noDataRetention: true,
  },
  {
    modelId: 'chutes-deepseek-v3.2-tee',
    displayName: 'DeepSeek V3.2 TEE (Chutes)',
    modelProvider: 'chutes',
    attestationVendor: 'chutes',
    upstream: 'deepseek-ai/DeepSeek-V3.2-TEE',
    inputPer1mUsd: 0.3,
    outputPer1mUsd: 1.2,
    maxContextTokens: 128_000,
    privacy: 'tee',
    teeAttested: true,
    e2ee: false,
    signedOutputs: true,
    noDataRetention: true,
  },
  {
    modelId: 'chutes-glm-5.2-tee',
    displayName: 'GLM 5.2 TEE (Chutes)',
    modelProvider: 'chutes',
    attestationVendor: 'chutes',
    upstream: 'zai-org/GLM-5.2-TEE',
    inputPer1mUsd: 0.35,
    outputPer1mUsd: 1.4,
    maxContextTokens: 200_000,
    privacy: 'tee',
    teeAttested: true,
    e2ee: false,
    signedOutputs: true,
    noDataRetention: true,
  },
  {
    modelId: 'chutes-minimax-m2.5-tee',
    displayName: 'MiniMax M2.5 TEE (Chutes)',
    modelProvider: 'chutes',
    attestationVendor: 'chutes',
    upstream: 'MiniMaxAI/MiniMax-M2.5-TEE',
    inputPer1mUsd: 0.25,
    outputPer1mUsd: 1.0,
    maxContextTokens: 128_000,
    privacy: 'tee',
    teeAttested: true,
    e2ee: false,
    signedOutputs: true,
    noDataRetention: true,
  },
];

const PHALA_MODELS = [
  {
    modelId: 'phala/gemma-4-26b-a4b-uncensored',
    displayName: 'Phala Gemma 4 26B Uncensored',
    modelProvider: 'phala',
    attestationVendor: 'phala',
    upstream: 'phala/gemma-4-26b-a4b-uncensored',
    inputPer1mUsd: 0.15,
    outputPer1mUsd: 0.7,
    maxContextTokens: 66_000,
    privacy: 'tee',
    teeAttested: true,
    e2ee: true,
    signedOutputs: true,
    noDataRetention: true,
  },
];

/** Z.ai GLM Coding Plan — static rates (OpenAI-compatible coding endpoint). */
const ZAI_MODELS = [
  {
    modelId: 'glm-4.7',
    displayName: 'GLM 4.7 (Z.ai Coding Plan)',
    modelProvider: 'zai',
    attestationVendor: 'zai',
    upstream: 'glm-4.7',
    inputPer1mUsd: 0.5,
    outputPer1mUsd: 1.5,
    maxContextTokens: 200_000,
    privacy: 'standard',
    teeAttested: false,
    e2ee: false,
    signedOutputs: false,
    noDataRetention: false,
  },
  {
    modelId: 'glm-5-turbo',
    displayName: 'GLM 5 Turbo (Z.ai Coding Plan)',
    modelProvider: 'zai',
    attestationVendor: 'zai',
    upstream: 'glm-5-turbo',
    inputPer1mUsd: 0.4,
    outputPer1mUsd: 1.2,
    maxContextTokens: 200_000,
    privacy: 'standard',
    teeAttested: false,
    e2ee: false,
    signedOutputs: false,
    noDataRetention: false,
  },
  {
    modelId: 'glm-5.2',
    displayName: 'GLM 5.2 (Z.ai Coding Plan)',
    modelProvider: 'zai',
    attestationVendor: 'zai',
    upstream: 'glm-5.2',
    inputPer1mUsd: 0.6,
    outputPer1mUsd: 2,
    maxContextTokens: 200_000,
    privacy: 'standard',
    teeAttested: false,
    e2ee: false,
    signedOutputs: false,
    noDataRetention: false,
  },
];

/** xAI Grok — static reference rates (OpenAI-compatible https://api.x.ai/v1). */
const XAI_MODELS = [
  {
    modelId: 'grok-4.5',
    displayName: 'Grok 4.5',
    modelProvider: 'xai',
    attestationVendor: 'xai',
    upstream: 'grok-4.5',
    inputPer1mUsd: 2,
    outputPer1mUsd: 6,
    maxContextTokens: 500_000,
    privacy: 'standard',
    teeAttested: false,
    e2ee: false,
    signedOutputs: false,
    noDataRetention: false,
  },
  {
    modelId: 'grok-4-1-fast-reasoning',
    displayName: 'Grok 4.1 Fast Reasoning',
    modelProvider: 'xai',
    attestationVendor: 'xai',
    upstream: 'grok-4-1-fast-reasoning',
    inputPer1mUsd: 0.2,
    outputPer1mUsd: 0.5,
    maxContextTokens: 2_000_000,
    privacy: 'standard',
    teeAttested: false,
    e2ee: false,
    signedOutputs: false,
    noDataRetention: false,
  },
  {
    modelId: 'grok-4-1-fast-non-reasoning',
    displayName: 'Grok 4.1 Fast',
    modelProvider: 'xai',
    attestationVendor: 'xai',
    upstream: 'grok-4-1-fast-non-reasoning',
    inputPer1mUsd: 0.2,
    outputPer1mUsd: 0.5,
    maxContextTokens: 2_000_000,
    privacy: 'standard',
    teeAttested: false,
    e2ee: false,
    signedOutputs: false,
    noDataRetention: false,
  },
];

function isTeeModelId(modelId) {
  const normalized = modelId.toLowerCase();
  return (
    normalized.startsWith('tee-') ||
    normalized.startsWith('e2ee-') ||
    normalized.includes('phala/')
  );
}

function isE2eeModelId(modelId) {
  return modelId.toLowerCase().startsWith('e2ee-');
}

function slugProviderId(modelId) {
  return `market-${modelId.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`;
}

function estimateReferenceRateUsd(model) {
  const input = (1_000 / 1_000_000) * (model.inputPer1mUsd ?? 0);
  const output = (1_024 / 1_000_000) * (model.outputPer1mUsd ?? 0);
  return Math.max(0.01, Number((input + output).toFixed(4)));
}

function buildMarketplaceProvider(model, port, spawnWorker) {
  const providerId = slugProviderId(model.modelId);
  const minimumChargeUsd = Math.max(0.01, Number((model.inputPer1mUsd * 0.001).toFixed(4)));

  return {
    spawnWorker,
    providerId,
    displayName: model.displayName,
    endpointType: 'http',
    endpoint: `http://127.0.0.1:${port}`,
    specializations: ['inference', 'text'],
    supportedLanguages: ['text'],
    supportedFrameworks: ['openai_compatible'],
    modelFamily: model.modelProvider,
    modelProvider: model.modelProvider,
    modelId: model.modelId,
    outputTypes: ['text', 'json'],
    agentFramework: 'openai_compatible',
    marketplaceOfferStatus: 'active',
    verification: {
      status: 'verified',
      apiVerified: true,
      frameworkVerified: true,
      modelVerified: true,
      notes: ['catalog-synced inference seller'],
    },
    privacy: {
      teeAttested: Boolean(model.teeAttested),
      e2ee: Boolean(model.e2ee),
      teeVendor: model.attestationVendor ?? model.modelProvider,
      signedOutputs: Boolean(model.signedOutputs ?? true),
      noDataRetention: Boolean(model.noDataRetention ?? model.privacy === 'private'),
    },
    pricing: {
      mode: 'token_metered',
      currency: 'USD',
      pricePer1mInputTokensUsd: model.inputPer1mUsd,
      pricePer1mOutputTokensUsd: model.outputPer1mUsd,
      minimumChargeUsd,
      rateCardVersion: 'catalog-v1',
      upstreamModelId: model.upstream ?? model.modelId,
      maxContextTokens: model.maxContextTokens ?? 128_000,
    },
    pricePerTaskUsd: estimateReferenceRateUsd(model),
    maxConcurrency: 4,
    status: 'available',
    auth: {
      type: 'bearer',
      token: `bossraid-market-${providerId}`,
    },
    reputation: {
      globalScore: 0.84,
      responsivenessScore: 0.86,
      validityScore: 0.83,
      qualityScore: 0.85,
      timeoutRate: 0.04,
      duplicateRate: 0.01,
      specializationScores: { inference: 0.9 },
      p50LatencyMs: 2_400,
      p95LatencyMs: 6_500,
      totalRaids: 48,
      totalSuccessfulRaids: 44,
    },
  };
}

async function fetchVeniceTextModels() {
  const response = await fetch('https://api.venice.ai/api/v1/models', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Venice models request failed: ${response.status}`);
  }

  const payload = await response.json();
  return (payload.data ?? [])
    .filter((model) => model.type === 'text' && model.model_spec?.offline !== true)
    .map((model) => {
      const supportsE2ee = model.model_spec?.capabilities?.supportsE2EE === true;
      return {
        modelId: model.id,
        displayName: model.model_spec?.name ?? model.id,
        modelProvider: 'venice',
        attestationVendor: 'venice',
        upstreamModelId: model.id,
        inputPer1mUsd: model.model_spec?.pricing?.input?.usd ?? 0.2,
        outputPer1mUsd: model.model_spec?.pricing?.output?.usd ?? 0.8,
        maxContextTokens: model.model_spec?.availableContextTokens ?? model.context_length ?? 128_000,
        privacy: model.model_spec?.privacy ?? 'private',
        teeAttested: isTeeModelId(model.id),
        e2ee: isE2eeModelId(model.id) || supportsE2ee,
        signedOutputs: true,
        noDataRetention: model.model_spec?.privacy === 'private',
      };
    })
    .sort((left, right) => left.modelId.localeCompare(right.modelId));
}

function writeCatalogTs(catalog) {
  const body = `/* generated by scripts/sync-inference-catalog.mjs — do not edit by hand */

export type InferenceCatalogEntry = {
  modelId: string;
  displayName: string;
  modelProvider: 'venice' | 'phala' | 'redpill' | 'near' | 'chutes' | 'xai' | 'zai';
  attestationVendor: 'venice' | 'phala' | 'redpill' | 'near' | 'chutes' | 'xai' | 'zai';
  upstreamModelId: string;
  inputPer1mUsd: number;
  outputPer1mUsd: number;
  maxContextTokens: number;
  privacy: string;
  teeAttested: boolean;
  e2ee: boolean;
};

export const INFERENCE_MODEL_CATALOG: InferenceCatalogEntry[] = ${JSON.stringify(catalog, null, 2)} as const;

export function listInferenceCatalogModelIds(): string[] {
  return INFERENCE_MODEL_CATALOG.map((entry) => entry.modelId);
}
`;

  writeFileSync(resolve(rootDir, 'packages/constants/src/inference-catalog.ts'), body);
}

function writeProvidersJson(providers) {
  writeFileSync(
    resolve(rootDir, 'examples/inference/inference-marketplace-providers.json'),
    `${JSON.stringify(providers, null, 2)}\n`
  );
}

function writeCatalogPricingJson(catalog) {
  const providers = {};
  for (const entry of catalog) {
    const bucket = providers[entry.modelProvider] ?? { modelCount: 0, models: [] };
    bucket.modelCount += 1;
    bucket.models.push({
      modelId: entry.modelId,
      displayName: entry.displayName,
      upstreamModelId: entry.upstreamModelId,
      inputPer1mUsd: entry.inputPer1mUsd,
      outputPer1mUsd: entry.outputPer1mUsd,
      referenceTaskUsd: estimateReferenceRateUsd(entry),
      maxContextTokens: entry.maxContextTokens,
      teeAttested: Boolean(entry.teeAttested),
      e2ee: Boolean(entry.e2ee),
    });
    providers[entry.modelProvider] = bucket;
  }

  for (const bucket of Object.values(providers)) {
    bucket.models.sort((left, right) => left.modelId.localeCompare(right.modelId));
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    source: {
      venice: 'https://api.venice.ai/api/v1/models (public, no API key)',
      redpill: 'scripts/sync-inference-catalog.mjs static rates',
      near: 'scripts/sync-inference-catalog.mjs static rates',
      chutes: 'scripts/sync-inference-catalog.mjs static rates (llm.chutes.ai)',
      phala: 'scripts/sync-inference-catalog.mjs static rates',
      xai: 'scripts/sync-inference-catalog.mjs static rates (api.x.ai)',
      zai: 'scripts/sync-inference-catalog.mjs static rates (api.z.ai coding paas)',
    },
    providers,
    models: catalog
      .map((entry) => ({
        modelId: entry.modelId,
        modelProvider: entry.modelProvider,
        displayName: entry.displayName,
        upstreamModelId: entry.upstreamModelId,
        inputPer1mUsd: entry.inputPer1mUsd,
        outputPer1mUsd: entry.outputPer1mUsd,
        referenceTaskUsd: estimateReferenceRateUsd(entry),
        maxContextTokens: entry.maxContextTokens,
      }))
      .sort((left, right) => left.modelId.localeCompare(right.modelId)),
  };

  writeFileSync(
    resolve(rootDir, 'packages/constants/data/inference-model-pricing.json'),
    `${JSON.stringify(payload, null, 2)}\n`
  );
}

function writeBenchmarkPatch(catalog) {
  const taskUsd = {};
  const inputUsd = {};
  const outputUsd = {};

  for (const model of catalog) {
    taskUsd[model.modelId] = estimateReferenceRateUsd(model);
    inputUsd[model.modelId] = model.inputPer1mUsd;
    outputUsd[model.modelId] = model.outputPer1mUsd;
  }

  const body = `/* generated by scripts/sync-inference-catalog.mjs — do not edit by hand */

export const CATALOG_BENCHMARK_TASK_USD: Record<string, number> = ${JSON.stringify(taskUsd, null, 2)};

export const CATALOG_BENCHMARK_INPUT_PER_1M_USD: Record<string, number> = ${JSON.stringify(inputUsd, null, 2)};

export const CATALOG_BENCHMARK_OUTPUT_PER_1M_USD: Record<string, number> = ${JSON.stringify(outputUsd, null, 2)};
`;

  writeFileSync(resolve(rootDir, 'packages/constants/src/inference-catalog-benchmark.ts'), body);
}

function assertUniqueModelIds(catalog) {
  const seen = new Map();
  for (const entry of catalog) {
    const prior = seen.get(entry.modelId);
    if (prior) {
      throw new Error(
        `Duplicate inference catalog modelId '${entry.modelId}' (${prior.modelProvider} vs ${entry.modelProvider}).`
      );
    }
    seen.set(entry.modelId, entry);
  }
}

function normalizeStaticModels(models) {
  return models.map((model) => ({
    modelId: model.modelId,
    displayName: model.displayName,
    modelProvider: model.modelProvider,
    attestationVendor: model.attestationVendor ?? model.modelProvider,
    upstreamModelId: model.upstream ?? model.modelId,
    inputPer1mUsd: model.inputPer1mUsd,
    outputPer1mUsd: model.outputPer1mUsd,
    maxContextTokens: model.maxContextTokens,
    privacy: model.privacy,
    teeAttested: model.teeAttested,
    e2ee: model.e2ee,
    signedOutputs: model.signedOutputs,
    noDataRetention: model.noDataRetention,
  }));
}

async function main() {
  const veniceModels = await fetchVeniceTextModels();
  const redpillModels = normalizeStaticModels(REDPILL_MODELS);
  const nearModels = normalizeStaticModels(NEAR_MODELS);
  const chutesModels = normalizeStaticModels(CHUTES_MODELS);
  const phalaModels = normalizeStaticModels(PHALA_MODELS);
  const xaiModels = normalizeStaticModels(XAI_MODELS);
  const zaiModels = normalizeStaticModels(ZAI_MODELS);
  const catalog = [
    ...veniceModels,
    ...redpillModels,
    ...nearModels,
    ...chutesModels,
    ...phalaModels,
    ...xaiModels,
    ...zaiModels,
  ];
  assertUniqueModelIds(catalog);

  let livePort = 9100;
  const providers = catalog.map((model) => {
    const spawnWorker = FEATURED_LIVE_MODEL_IDS.has(model.modelId);
    const port = spawnWorker ? livePort++ : 9200;
    return buildMarketplaceProvider(model, port, spawnWorker);
  });

  writeCatalogTs(
    catalog.map((entry) => ({
      modelId: entry.modelId,
      displayName: entry.displayName,
      modelProvider: entry.modelProvider,
      attestationVendor: entry.attestationVendor ?? entry.modelProvider,
      upstreamModelId: entry.upstreamModelId,
      inputPer1mUsd: entry.inputPer1mUsd,
      outputPer1mUsd: entry.outputPer1mUsd,
      maxContextTokens: entry.maxContextTokens,
      privacy: entry.privacy,
      teeAttested: Boolean(entry.teeAttested),
      e2ee: Boolean(entry.e2ee),
    }))
  );
  writeBenchmarkPatch(catalog);
  writeCatalogPricingJson(catalog);
  writeProvidersJson(providers);

  console.log(
    `[catalog] synced ${veniceModels.length} Venice + ${redpillModels.length} Redpill + ${nearModels.length} NEAR + ${chutesModels.length} Chutes + ${phalaModels.length} Phala + ${xaiModels.length} xAI + ${zaiModels.length} Z.ai models`
  );
  console.log(`[catalog] wrote packages/constants/src/inference-catalog.ts`);
  console.log(`[catalog] wrote examples/inference/inference-marketplace-providers.json (${providers.length} sellers)`);
  console.log('[catalog] wrote packages/constants/data/inference-model-pricing.json');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});