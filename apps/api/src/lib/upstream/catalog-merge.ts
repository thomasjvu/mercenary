import { INFERENCE_MODEL_CATALOG, type UpstreamProviderId } from '@bossraid/constants';
import type { MergedUpstreamCatalogModel, UpstreamModelRecord } from './types.js';

export function mergeUpstreamCatalogModelsForProvider(
  provider: UpstreamProviderId,
  upstreamModels: UpstreamModelRecord[]
): MergedUpstreamCatalogModel[] {
  const upstreamIds = new Set(upstreamModels.map((model) => model.id));

  return INFERENCE_MODEL_CATALOG.filter((entry) => entry.modelProvider === provider)
    .map((entry) => {
      const upstreamFound =
        upstreamIds.has(entry.upstreamModelId) || upstreamIds.has(entry.modelId);
      return {
        modelId: entry.modelId,
        displayName: entry.displayName,
        modelProvider: provider,
        supported: true,
        upstreamFound,
        teeAttested: entry.teeAttested,
        e2ee: entry.e2ee,
        maxContextTokens: entry.maxContextTokens ?? null,
        referenceInputPer1mUsd: entry.inputPer1mUsd ?? null,
        referenceOutputPer1mUsd: entry.outputPer1mUsd ?? null,
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}
