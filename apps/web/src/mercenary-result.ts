import type {
  ChatCompletionResponse,
  RaidAgentLog,
  RaidResult,
  RaidSpawnOutput,
  RaidStatus as RaidStatusSnapshot,
} from './api';

export {
  selectApprovedProviderIds,
  selectArtifacts,
  selectCanonicalSummaryText,
  selectChatCompletionText,
  selectPrimaryOutputType,
  selectResultExplanation,
  selectResultPatch,
  selectResultText,
  selectSynthesizedArtifacts,
  selectWorkstreams,
} from './lib/raid-result-view.js';

export type LiveRaidRun = {
  spawn: RaidSpawnOutput;
  directResponse?: boolean;
  chatCompletion?: ChatCompletionResponse;
  startedAtMs: number;
  completedAtMs?: number;
  status?: RaidStatusSnapshot;
  result?: RaidResult;
  agentLog?: RaidAgentLog;
  lastUpdatedAt?: string;
  pollError?: string | null;
};

export const MERCENARY_PROMPTS = [
  'Hi Mercenary. What can you actually help me with here?',
  'How do you decide when a request needs specialists instead of a direct answer?',
  'Build a one-room GB Studio microgame with one boss, one key, one exit, and a matching 12-second trailer.',
] as const;

export const DEFAULT_MERCENARY_BUDGET_USD = 12;

export function buildMercenaryChatCompletionPayload(
  brief: string,
  maxBudgetUsd = DEFAULT_MERCENARY_BUDGET_USD
) {
  return {
    model: 'mercenary-v1',
    messages: [
      {
        role: 'system',
        content: 'You are Mercenary. Be concise and return one clean final answer.',
      },
      {
        role: 'user',
        content: brief,
      },
    ],
    raid_policy: {
      max_agents: 3,
      required_capabilities: ['analysis'],
      allowed_model_families: ['openai', 'venice'],
      min_reputation_score: 70,
      require_erc8004: true,
      min_trust_score: 75,
      privacy_mode: 'prefer',
      require_privacy_features: ['signed_outputs'],
      max_total_cost: maxBudgetUsd,
      selection_mode: 'privacy_first',
    },
  };
}

export function buildSpawnFromChatCompletion(
  chatCompletion: ChatCompletionResponse | null
): RaidSpawnOutput | null {
  if (!chatCompletion?.raid) {
    return null;
  }

  return {
    raidId: chatCompletion.raid.raid_id,
    raidAccessToken: chatCompletion.raid.raid_access_token,
    receiptPath: chatCompletion.raid.receipt_path,
    status: chatCompletion.raid.status ?? 'queued',
    selectedExperts: chatCompletion.raid.agents_invited,
    reserveExperts: 0,
    estimatedFirstResultSec: 0,
    sanitization: {
      riskTier: 'safe',
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      trimmedFiles: 0,
    },
  };
}

export function buildDirectChatSpawn(
  chatCompletion: ChatCompletionResponse | undefined
): RaidSpawnOutput {
  return {
    raidId: chatCompletion?.id ?? 'chatcmpl_direct',
    raidAccessToken: '',
    receiptPath: '',
    status: 'final',
    selectedExperts: 0,
    reserveExperts: 0,
    estimatedFirstResultSec: 0,
    sanitization: {
      riskTier: 'safe',
      redactedSecrets: 0,
      redactedIdentifiers: 0,
      trimmedFiles: 0,
    },
  };
}

export function buildRuntimeAttestationLabel(target: string, teePlatform: string): string {
  const haystack = `${target} ${teePlatform}`.toLowerCase();
  if (haystack.includes('phala')) {
    return 'Phala TEE attested';
  }
  if (haystack.includes('eigen')) {
    return 'EigenCompute TEE attested';
  }
  if (teePlatform !== 'pending' && teePlatform.trim().length > 0) {
    return `${teePlatform} TEE attested`;
  }
  return 'TEE attestation';
}

export function isAttestationSignerUnavailable(error: string | null | undefined): boolean {
  return typeof error === 'string' && error.includes('MNEMONIC environment variable is required');
}

export function buildAbsolutePath(path: string): string {
  if (typeof window === 'undefined') {
    return path;
  }

  return new URL(path, window.location.origin).toString();
}
