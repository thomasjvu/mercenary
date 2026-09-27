import {
  listInferenceCatalogEntriesForProvider,
  type UpstreamProviderId,
} from '@bossraid/constants';
import type { MergedUpstreamCatalogModel, UpstreamModelRecord } from './types.js';

export function mergeUpstreamCatalogModelsForProvider(
  provider: UpstreamProviderId,
  upstreamModels: UpstreamModelRecord[]
): MergedUpstreamCatalogModel[] {
  const upstreamIds = new Set(upstreamModels.map((model) => model.id));

  const matched = new Set<string>();
  const models: MergedUpstreamCatalogModel[] = listInferenceCatalogEntriesForProvider(provider).map(
    (entry) => {
      const aliases = [entry.upstreamModelId, ...(entry.upstreamAliases ?? [])];
      const upstreamModelId = aliases.find((id) => upstreamIds.has(id));
      for (const id of aliases) if (upstreamIds.has(id)) matched.add(id);
      const upstreamFound = Boolean(upstreamModelId);
      return {
        modelId: entry.modelId,
        displayName: entry.displayName,
        modelProvider: provider,
        supported: true,
        upstreamFound,
        upstreamModelId: upstreamModelId ?? entry.upstreamModelId,
        state: upstreamFound ? ('live_unverified' as const) : ('catalog_only' as const),
        offerable: upstreamFound,
        teeAttested: entry.teeAttested,
        e2ee: entry.e2ee,
        maxContextTokens: entry.maxContextTokens ?? null,
        referenceInputPer1mUsd: entry.inputPer1mUsd ?? null,
        referenceOutputPer1mUsd: entry.outputPer1mUsd ?? null,
      };
    }
  );
  for (const model of upstreamModels) {
    if (matched.has(model.id)) continue;
    matched.add(model.id);
    models.push({
      modelId: model.id.startsWith(`${provider}/`) ? model.id : `${provider}/${model.id}`,
      upstreamModelId: model.id,
      displayName: model.displayName ?? model.id,
      modelProvider: provider,
      supported: false,
      upstreamFound: true,
      offerable: false,
      state: 'live_unpriced',
      teeAttested: false,
      e2ee: false,
      maxContextTokens: model.maxContextTokens ?? null,
      referenceInputPer1mUsd: null,
      referenceOutputPer1mUsd: null,
    });
  }
  return models.sort((left, right) => left.displayName.localeCompare(right.displayName));
}
