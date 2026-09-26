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
import {
  fetchDarkbloomAttestationReport,
  fetchDarkbloomUpstreamModels,
  probeDarkbloomChatCompletion,
} from './darkbloom.js';
import {
  fetchNebiusAttestationReport,
  fetchNebiusUpstreamModels,
  probeNebiusChatCompletion,
} from './nebius.js';
import {
  fetchOpenAIAttestationReport,
  fetchOpenAIUpstreamModels,
  probeOpenAIChatCompletion,
} from './openai.js';
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
  apiKey: string,
  options: { env?: NodeJS.ProcessEnv } = {}
): Promise<UpstreamModelRecord[]> {
  switch (provider) {
    case 'venice':
      return fetchVeniceUpstreamModels(apiKey, options);
    case 'redpill':
      return fetchRedpillUpstreamModels(apiKey, options);
    case 'near':
      return fetchNearUpstreamModels(apiKey, options);
    case 'chutes':
      return fetchChutesUpstreamModels(apiKey, options);
    case 'phala':
      return fetchPhalaUpstreamModels(apiKey, options);
    case 'xai':
      return fetchXaiUpstreamModels(apiKey, options);
    case 'zai':
      return fetchZaiUpstreamModels(apiKey, options);
    case 'anthropic':
      return fetchAnthropicUpstreamModels(apiKey, options);
    case 'darkbloom':
      return fetchDarkbloomUpstreamModels(apiKey, options);
    case 'nebius':
      return fetchNebiusUpstreamModels(apiKey, options);
    case 'openai':
      return fetchOpenAIUpstreamModels(apiKey, options);
  }
}

export async function probeUpstreamChatCompletion(input: {
  provider: UpstreamProviderId;
  apiKey: string;
  modelId: string;
  prompt?: string;
  env?: NodeJS.ProcessEnv;
  /** From `.bossraid/chat-options.json` (max_tokens, temperature, reasoning_effort). */
  chatOptions?: {
    max_tokens?: number;
    temperature?: number;
    reasoning_effort?: 'low' | 'medium' | 'high' | 'xhigh';
  };
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
    case 'darkbloom':
      return probeDarkbloomChatCompletion(input);
    case 'nebius':
      return probeNebiusChatCompletion(input);
    case 'openai':
      return probeOpenAIChatCompletion(input);
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
    case 'darkbloom':
      return fetchDarkbloomAttestationReport(input);
    case 'nebius':
      return fetchNebiusAttestationReport(input);
    case 'openai':
      return fetchOpenAIAttestationReport(input);
  }
}
