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
import {
  fetchAnthropicAttestationReport,
  fetchAnthropicUpstreamModels,
  probeAnthropicChatCompletion,
} from './anthropic.js';
import {
  fetchXaiAttestationReport,
  fetchXaiUpstreamModels,
  probeXaiChatCompletion,
} from './xai.js';
import {
  fetchZaiAttestationReport,
  fetchZaiUpstreamModels,
  probeZaiChatCompletion,
} from './zai.js';
import type { UpstreamChatResult, UpstreamModelRecord } from './types.js';

export type {
  MergedUpstreamCatalogModel,
  UpstreamChatResult,
  UpstreamModelRecord,
} from './types.js';
export { generateAttestationNonce } from './shared.js';
export { mergeUpstreamCatalogModelsForProvider } from './catalog-merge.js';

export function parseUpstreamProviderParam(provider: string): UpstreamProviderId | undefined {
  return isUpstreamProviderId(provider) ? provider : undefined;
}

export async function fetchUpstreamModels(
  provider: UpstreamProviderId,
  apiKey: string
): Promise<UpstreamModelRecord[]> {
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
    case 'xai':
      return fetchXaiUpstreamModels(apiKey);
    case 'zai':
      return fetchZaiUpstreamModels(apiKey);
    case 'anthropic':
      return fetchAnthropicUpstreamModels(apiKey);
  }
}

export async function probeUpstreamChatCompletion(input: {
  provider: UpstreamProviderId;
  apiKey: string;
  modelId: string;
  prompt?: string;
  env?: NodeJS.ProcessEnv;
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
    case 'xai':
      return probeXaiChatCompletion(input);
    case 'zai':
      return probeZaiChatCompletion(input);
    case 'anthropic':
      return probeAnthropicChatCompletion(input);
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
    case 'xai':
      return fetchXaiAttestationReport(input);
    case 'zai':
      return fetchZaiAttestationReport(input);
    case 'anthropic':
      return fetchAnthropicAttestationReport(input);
  }
}
