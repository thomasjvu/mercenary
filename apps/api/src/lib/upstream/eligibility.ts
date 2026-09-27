import { INFERENCE_MODEL_CATALOG, type UpstreamProviderId } from '@bossraid/constants';
import { verifyUpstreamTee } from '../attestation-service.js';
import { probeUpstreamChatCompletion } from './index.js';

/** A model-list response alone does not prove the key can complete a request. */
export async function verifyHostedModel(input: {
  provider: UpstreamProviderId;
  apiKey: string;
  modelId: string;
  upstreamModelId: string;
  env?: NodeJS.ProcessEnv;
}): Promise<void> {
  const entry = INFERENCE_MODEL_CATALOG.find(
    (m) => m.modelId === input.modelId && m.modelProvider === input.provider
  );
  if (!entry) throw new Error('unsupported_catalog_model');
  await probeUpstreamChatCompletion({
    ...input,
    modelId: input.upstreamModelId,
    prompt: 'Reply with the single word: ok',
    chatOptions: { max_tokens: entry.capabilities?.reasoning ? 1024 : 32 },
  });
  if (entry.teeAttested || entry.e2ee) {
    const { attestation } = await verifyUpstreamTee({
      provider: input.provider,
      apiKey: input.apiKey,
      modelId: input.upstreamModelId,
      providerId: `catalog-probe:${input.provider}`,
      env: input.env,
    });
    if (!attestation.valid || (entry.e2ee && !attestation.e2eeReady))
      throw new Error('tee_preflight_failed');
  }
}
