import { INFERENCE_MODEL_CATALOG } from '@bossraid/constants';
import type { ChatCompletionRequest } from '@bossraid/shared-types';

/**
 * Server-side E2EE chat hook.
 *
 * Strict-private E2EE models (Venice `e2ee-*` catalog entries) require client-side
 * message encryption before upstream inference. The web playground already uses
 * `apps/web/src/lib/e2ee/venice.ts` for that path.
 *
 * This hook is the server insertion point for a future hosted E2EE relay:
 * 1. verify upstream TEE attestation and resolve signing key
 * 2. encrypt user/system messages with the model public key
 * 3. call upstream chat/completions with `venice_parameters.include_venice_system_prompt`
 * 4. decrypt streamed ciphertext deltas before returning OpenAI-compatible output
 *
 * Until that relay ships, server chat routes continue to spawn standard raids and
 * reject strict-private lanes that cannot satisfy required privacy metadata.
 */
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

export async function runServerE2eeChatCompletion(_input: {
  chatRequest: ChatCompletionRequest;
  route: ChatE2eeRoute;
}): Promise<never> {
  throw new Error(
    'Server-side E2EE chat relay is not enabled. Use the web playground strict-private lane or configure a buyer upstream key for direct Venice E2EE.'
  );
}
