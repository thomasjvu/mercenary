import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import type { InferenceMarket } from '../api/marketplace.js';

export type PlaygroundModelOption = {
  modelId: string;
  displayName: string;
  modelProvider: string;
  liveSellers: number;
  referenceRateUsd: number | null;
  teeAttested: boolean;
  e2ee: boolean;
  attestationVendor: string;
};

export function buildPlaygroundModelOptions(
  markets: InferenceMarket[] = []
): PlaygroundModelOption[] {
  const catalogById = new Map(INFERENCE_MODEL_CATALOG.map((entry) => [entry.modelId, entry]));

  return markets
    .map((market) => {
      const catalog = catalogById.get(market.modelId);
      return {
        modelId: market.modelId,
        displayName: catalog?.displayName ?? market.modelId,
        modelProvider: market.modelProvider ?? catalog?.modelProvider ?? 'unknown',
        liveSellers: market.activeProviderCount ?? market.providerCount ?? 0,
        referenceRateUsd: market.cheapestRateUsd,
        teeAttested: catalog?.teeAttested ?? false,
        e2ee: catalog?.e2ee ?? false,
        attestationVendor: catalog?.attestationVendor ?? catalog?.modelProvider ?? 'venice',
      };
    })
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}
