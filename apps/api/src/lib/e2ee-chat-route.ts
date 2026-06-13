import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import type { ChatCompletionRequest } from '@bossraid/shared-types';

export type ChatE2eeRoute = {
  enabled: true;
  modelId: string;
  upstreamModelId: string;
  attestationVendor: string;
};

export function resolveChatE2eeRoute(
  chatRequest: ChatCompletionRequest
): ChatE2eeRoute | undefined {
  const privacyMode = chatRequest.raidPolicy?.privacyMode === 'strict' ? 'strict' : undefined;
  if (privacyMode !== 'strict') {
    return undefined;
  }

  const catalogEntry = INFERENCE_MODEL_CATALOG.find((entry) => entry.modelId === chatRequest.model);
  if (!catalogEntry?.e2ee) {
    return undefined;
  }

  return {
    enabled: true,
    modelId: catalogEntry.modelId,
    upstreamModelId: catalogEntry.upstreamModelId ?? catalogEntry.modelId,
    attestationVendor: catalogEntry.attestationVendor ?? catalogEntry.modelProvider ?? 'venice',
  };
}
