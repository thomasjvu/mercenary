import { SOURCE_URLS } from './sources.mjs';

const rate = (value) =>
  (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) &&
  Number.isFinite(Number(value)) &&
  Number(value) >= 0
    ? Number(value)
    : undefined;
const perToken = (value) =>
  rate(value) === undefined ? undefined : Number((Number(value) * 1_000_000).toFixed(8));
const priced = (cost) => rate(cost?.input) !== undefined && rate(cost?.output) !== undefined;

export function normalizeCost(cost) {
  if (!priced(cost)) return undefined;
  const out = { input: rate(cost.input), output: rate(cost.output) };
  for (const key of ['cache_read', 'cache_write', 'reasoning', 'input_audio', 'output_audio']) {
    if (rate(cost[key]) !== undefined) out[key] = rate(cost[key]);
  }
  return out;
}

export function normalizeTiers(cost) {
  const tiers =
    cost?.tiers ??
    (cost?.context_over_200k
      ? [{ ...cost.context_over_200k, tier: { type: 'context', size: 200_000 } }]
      : []);
  if (!Array.isArray(tiers)) throw new Error('Invalid pricing tiers');
  const thresholds = new Set();
  return tiers
    .map((entry) => {
      const normalized = normalizeCost({ ...cost, ...entry });
      if (
        entry.tier?.type !== 'context' ||
        !Number.isSafeInteger(entry.tier.size) ||
        entry.tier.size < 0 ||
        thresholds.has(entry.tier.size) ||
        !normalized
      ) {
        throw new Error('Unsupported pricing tier; add an explicit pricing override');
      }
      thresholds.add(entry.tier.size);
      return { aboveInputTokens: entry.tier.size, ...normalized };
    })
    .sort((a, b) => a.aboveInputTokens - b.aboveInputTokens);
}

function publicModels(provider, source) {
  return (source?.payload.data ?? source?.payload.models ?? []).map((m) => {
    const p = m.pricing ?? {};
    let cost;
    let limit = m.context_length ?? m.max_model_len ?? m.context_len ?? m.max_context_length;
    if (provider === 'venice') {
      cost = {
        input: m.model_spec?.pricing?.input?.usd,
        output: m.model_spec?.pricing?.output?.usd,
      };
      limit = m.model_spec?.availableContextTokens ?? limit;
    } else if (provider === 'chutes') {
      cost = {
        input: m.price?.input?.usd ?? p.prompt ?? p.input,
        output: m.price?.output?.usd ?? p.completion ?? p.output,
      };
    } else if (provider === 'near') {
      cost = {
        input: rate(p.input) ?? perToken(p.prompt),
        output: rate(p.output) ?? perToken(p.completion),
      };
    } else if (provider === 'redpill') {
      cost = {
        input: perToken(p.prompt) ?? rate(p.input),
        output: perToken(p.completion) ?? rate(p.output),
      };
    } else if (provider === 'phala') {
      cost = {
        input: perToken(m.specs?.input_cost_per_token ?? p.prompt) ?? rate(p.input),
        output: perToken(m.specs?.output_cost_per_token ?? p.completion) ?? rate(p.output),
      };
      limit = m.specs?.context_length ?? limit;
    }
    if (cost) {
      cost.cache_read =
        provider === 'chutes'
          ? (m.price?.input_cache_read?.usd ?? rate(p.input_cache_read))
          : provider === 'venice'
            ? m.model_spec?.pricing?.cache_input?.usd
            : perToken(p.input_cache_read);
      cost.tiers = p.tiers;
    }
    const outputs =
      m.output_modalities ?? m.architecture?.outputModalities ?? m.specs?.output_modalities;
    const chat =
      provider === 'venice'
        ? m.type === 'text'
        : (!Array.isArray(outputs) || (outputs.length === 1 && outputs[0] === 'text')) &&
          (!Array.isArray(m.capabilities) ||
            !m.capabilities.length ||
            m.capabilities.includes('chat'));
    return {
      id: m.id,
      name: m.model_spec?.name ?? m.display_name ?? m.name ?? m.id,
      cost,
      limit: {
        context: Number(limit) || undefined,
        ...(m.max_output_length > 0 ? { output: m.max_output_length } : {}),
      },
      modalities: {
        input: m.input_modalities ??
          m.architecture?.inputModalities ??
          m.specs?.input_modalities ?? ['text'],
        output: chat ? ['text'] : [],
      },
      status:
        m.active === false || m.model_spec?.offline === true || Boolean(m.deprecated_at)
          ? 'deprecated'
          : undefined,
    };
  });
}

function supportsChat(model) {
  return (
    model.status !== 'deprecated' &&
    !model.type &&
    model.modalities?.input?.includes('text') &&
    model.modalities?.output?.length === 1 &&
    model.modalities.output[0] === 'text' &&
    !/embedding|rerank|realtime|audio|tts|whisper|transcri|image|diffusion|flux|sdxl|^sentence-transformers\//i.test(
      model.id
    )
  );
}

/** Explicit exact IDs and aliases only; prices always belong to the serving provider. */
export function buildCatalog(sources, overrides) {
  const catalog = [];
  const excluded = [];
  const allProviders = [
    'venice',
    'redpill',
    'near',
    'chutes',
    'phala',
    'darkbloom',
    'nebius',
    'openai',
    'xai',
    'zai',
    'anthropic',
  ];
  for (const provider of allProviders) {
    const remote = sources.providers.payload[overrides.providerAliases[provider]]?.models ?? {};
    const publicRows = publicModels(provider, sources[provider]);
    const ids = new Set([...Object.keys(remote), ...publicRows.map((m) => m.id)]);
    const publicMap = new Map(publicRows.map((m) => [m.id, m]));
    for (const upstreamId of [...ids].sort()) {
      const override = overrides.models[`${provider}/${upstreamId}`] ?? {};
      // A dated alias and its canonical entry share one Boss Raid model ID.
      const canonicalOverride = Object.entries(overrides.models).find(
        ([key, v]) => key.startsWith(`${provider}/`) && v.aliases?.includes(upstreamId)
      );
      if (canonicalOverride && ids.has(canonicalOverride[0].slice(provider.length + 1))) continue;
      const explicit = canonicalOverride?.[1] ?? override;
      const upstreamModelId = canonicalOverride
        ? canonicalOverride[0].slice(provider.length + 1)
        : upstreamId;
      const peer =
        remote[upstreamId] ?? (explicit.aliases ?? []).map((id) => remote[id]).find(Boolean);
      const live = publicMap.get(upstreamId);
      const canonicalModelId =
        explicit.canonicalModelId ??
        (sources.models.payload[`${overrides.providerAliases[provider]}/${upstreamId}`]
          ? `${overrides.providerAliases[provider]}/${upstreamId}`
          : sources.models.payload[upstreamId]
            ? upstreamId
            : undefined);
      const base = sources.models.payload[canonicalModelId] ?? {};
      const model = {
        ...base,
        ...peer,
        ...(live ?? {}),
        id: upstreamId,
        modalities: live?.modalities ?? peer?.modalities ?? base.modalities,
        status: live?.status ?? peer?.status ?? base.status,
        limit: { ...base.limit, ...peer?.limit, ...(live?.limit.context ? live.limit : {}) },
      };
      if (explicit.disabled || !supportsChat(model)) {
        excluded.push({ provider, modelId: upstreamId, reason: 'unsupported_or_deprecated' });
        continue;
      }
      const publicCost = normalizeCost(live?.cost);
      const priceData = explicit.cost ?? {
        ...(peer?.cost ?? {}),
        ...(publicCost ?? {}),
        ...(live?.cost?.tiers ? { tiers: live.cost.tiers } : {}),
      };
      const cost = normalizeCost(priceData);
      if (!cost || !(model.limit?.context > 0)) {
        excluded.push({
          provider,
          modelId: upstreamId,
          reason: !cost ? 'unpriced' : 'unknown_context_limit',
        });
        continue;
      }
      let tiers;
      try {
        tiers = normalizeTiers(priceData);
      } catch {
        excluded.push({ provider, modelId: upstreamId, reason: 'unsupported_price_tiers' });
        continue;
      }
      const modelId =
        explicit.modelId ??
        (provider === 'venice' || provider === 'xai' || provider === 'zai'
          ? upstreamId
          : upstreamId.startsWith(`${provider}/`)
            ? upstreamId
            : `${provider}/${upstreamId}`);
      catalog.push({
        modelId,
        displayName: model.name ?? upstreamId,
        modelProvider: provider,
        attestationVendor: provider,
        upstreamModelId,
        upstreamAliases: explicit.aliases ?? [],
        canonicalModelId,
        inputPer1mUsd: cost.input,
        outputPer1mUsd: cost.output,
        tokenPricing: { ...cost, tiers },
        maxContextTokens: model.limit.context,
        maxOutputTokens: model.limit.output > 0 ? model.limit.output : undefined,
        capabilities: {
          inputModalities: model.modalities.input,
          outputModalities: model.modalities.output,
          toolCall: peer?.tool_call ?? base.tool_call ?? false,
          reasoning: peer?.reasoning ?? base.reasoning ?? false,
          temperature: peer?.temperature ?? base.temperature,
          structuredOutput: peer?.structured_output ?? base.structured_output ?? false,
        },
        privacy: explicit.privacy ?? 'standard',
        teeAttested: explicit.teeAttested === true,
        e2ee: explicit.e2ee === true,
        source: {
          metadata: peer ? 'models.dev' : 'provider',
          metadataUrl: peer ? SOURCE_URLS.providers : sources[provider]?.url,
          pricing: explicit.cost ? 'override' : publicCost ? 'provider' : 'models.dev',
          pricingUrl: explicit.cost
            ? explicit.priceSource
            : publicCost
              ? sources[provider].url
              : SOURCE_URLS.providers,
          fetchedAt: (publicCost ? sources[provider] : sources.providers).fetchedAt,
          updatedAt: peer?.last_updated ?? base.last_updated,
        },
      });
    }
  }
  const seen = new Set();
  for (const m of catalog) {
    if (seen.has(m.modelId)) throw new Error(`Duplicate model ID ${m.modelId}`);
    seen.add(m.modelId);
  }
  return { catalog: catalog.sort((a, b) => a.modelId.localeCompare(b.modelId)), excluded };
}
