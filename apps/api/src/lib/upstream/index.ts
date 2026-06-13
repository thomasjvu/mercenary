import { isUpstreamProviderId, type UpstreamProviderId } from '@bossraid/constants';
import { mergeUpstreamCatalogModelsForProvider } from './catalog-merge.js';
import {
  fetchChutesAttestationEvidence,
  fetchChutesUpstreamModels,
  probeChutesChatCompletion,
} from './chutes.js';
import {
  fetchNearAttestationReport,
  fetchNearUpstreamModels,
  probeNearChatCompletion,
} from './near.js';
import {
  fetchPhalaAttestationReport,
  fetchPhalaUpstreamModels,
  probePhalaChatCompletion,
} from './phala.js';
import {
  fetchRedpillAttestationReport,
  fetchRedpillUpstreamModels,
  probeRedpillChatCompletion,
} from './redpill.js';
import {
  fetchVeniceAttestationReport,
  fetchVeniceUpstreamModels,
  probeVeniceChatCompletion,
} from './venice.js';
import type { MergedUpstreamCatalogModel, UpstreamChatResult } from './types.js';

export type {
  MergedUpstreamCatalogModel,
  UpstreamChatResult,
  UpstreamModelRecord,
} from './types.js';
export { generateAttestationNonce } from './shared.js';
export {
  fetchVeniceUpstreamModels,
  probeVeniceChatCompletion,
  fetchVeniceAttestationReport,
} from './venice.js';
export { mergeUpstreamCatalogModelsForProvider } from './catalog-merge.js';

export function parseUpstreamProviderParam(provider: string): UpstreamProviderId | undefined {
  return isUpstreamProviderId(provider) ? provider : undefined;
}

export async function fetchUpstreamModels(
  provider: UpstreamProviderId,
  apiKey: string
): Promise<ReturnType<typeof fetchVeniceUpstreamModels>> {
  switch (provider) {
    case 'venice':
      return fetchVeniceUpstreamModels(apiKey);
    case 'redpill':
      return fetchRedpillUpstreamModels(apiKey);
    case 'near':
      return fetchNearUpstreamModels(apiKey);
    case 'chutes':
      return fetchChutesUpstreamModels(apiKey);
    case 'phala':
      return fetchPhalaUpstreamModels(apiKey);
  }
}

export function mergeUpstreamCatalogModels(
  provider: UpstreamProviderId,
  upstreamModels: Awaited<ReturnType<typeof fetchVeniceUpstreamModels>>
): MergedUpstreamCatalogModel[] {
  return mergeUpstreamCatalogModelsForProvider(provider, upstreamModels);
}

export async function probeUpstreamChatCompletion(input: {
  provider: UpstreamProviderId;
  apiKey: string;
  modelId: string;
  prompt?: string;
}): Promise<UpstreamChatResult> {
  switch (input.provider) {
    case 'venice':
      return probeVeniceChatCompletion(input);
    case 'redpill':
      return probeRedpillChatCompletion(input);
    case 'near':
      return probeNearChatCompletion(input);
    case 'chutes':
      return probeChutesChatCompletion(input);
    case 'phala':
      return probePhalaChatCompletion(input);
  }
}

export async function fetchUpstreamAttestationReport(input: {
  provider: UpstreamProviderId;
  apiKey: string;
  modelId: string;
  nonce: string;
  instanceId?: string;
  signingAddress?: string;
}): Promise<Record<string, unknown>> {
  switch (input.provider) {
    case 'venice':
      return fetchVeniceAttestationReport(input);
    case 'redpill':
      return fetchRedpillAttestationReport(input);
    case 'near':
      return fetchNearAttestationReport(input);
    case 'chutes':
      if (!input.instanceId) {
        throw new Error('Chutes attestation requires instanceId.');
      }
      return fetchChutesAttestationEvidence({
        apiKey: input.apiKey,
        instanceId: input.instanceId,
        nonce: input.nonce,
      });
    case 'phala':
      return fetchPhalaAttestationReport(input);
  }
}

export function extractInferencePromptFromTask(task: {
  description?: string;
  failingSignals?: { expectedBehavior?: string };
}): string {
  const expected = task.failingSignals?.expectedBehavior?.trim();
  if (expected) {
    return expected;
  }

  const description = task.description?.trim();
  if (!description) {
    return 'Reply with one short sentence.';
  }

  const userBlocks = description
    .split('\n\n')
    .filter((block) => block.toLowerCase().startsWith('user:'))
    .map((block) => block.replace(/^user:\s*/i, '').trim());

  if (userBlocks.length > 0) {
    return userBlocks[userBlocks.length - 1] ?? description;
  }

  return description;
}
