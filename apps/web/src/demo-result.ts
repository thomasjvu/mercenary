import type { SubmissionArtifact } from '@bossraid/shared-types';
import type {
  ChatCompletionResponse,
  RaidAgentLog,
  RaidResult,
  RaidSpawnOutput,
  RaidStatus as RaidStatusSnapshot,
} from './api';
import { isLowSignalChatPrompt } from './demo-chat.js';
import { uniqueStrings } from './demo-format';

export type DemoRequestMode = 'raid' | 'chat_v1';

export type LiveRaidRun = {
  requestMode: DemoRequestMode;
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

export const RAID_DEMO_PROMPTS = [
  'Hi Mercenary. What can you actually help me with here?',
  'How do you decide when a request needs specialists instead of a direct answer?',
  'Build a one-room GB Studio microgame with one boss, one key, one exit, and a matching 12-second trailer.',
] as const;

export const CHAT_V1_DEMO_PROMPTS = [
  'Hi Mercenary. Give me a short intro to how this compatibility route works.',
  'Explain how v1 completions differs from the native raid path.',
  'Summarize how you would hire gameplay, art, and promo specialists for a small game launch.',
] as const;

const V1_CHAT_MODEL = 'gpt-4.1-mini';

export function selectResultText(result: RaidResult | undefined): string | undefined {
  return result?.synthesizedOutput?.answerText ?? result?.primarySubmission?.submission.answerText;
}

export function selectChatCompletionText(
  chatCompletion: ChatCompletionResponse | undefined
): string | undefined {
  return chatCompletion?.choices[0]?.message?.content;
}

export function selectResultExplanation(result: RaidResult | undefined): string | undefined {
  return (
    result?.synthesizedOutput?.explanation ?? result?.primarySubmission?.submission.explanation
  );
}

export function selectResultPatch(result: RaidResult | undefined): string | undefined {
  return (
    result?.synthesizedOutput?.patchUnifiedDiff ??
    result?.primarySubmission?.submission.patchUnifiedDiff
  );
}

export function selectArtifacts(result: RaidResult | undefined): SubmissionArtifact[] {
  return (result?.synthesizedOutput?.artifacts ??
    result?.primarySubmission?.submission.artifacts ??
    []) as SubmissionArtifact[];
}

export function selectApprovedProviderIds(result: RaidResult | undefined): string[] {
  if (!result) {
    return [];
  }

  if (result.settlementExecution?.successfulProviderIds.length) {
    return uniqueStrings(result.settlementExecution.successfulProviderIds);
  }

  if (result.synthesizedOutput?.contributingProviderIds.length) {
    return uniqueStrings(result.synthesizedOutput.contributingProviderIds);
  }

  return uniqueStrings(
    (result.approvedSubmissions ?? []).map((entry) => entry.submission.providerId)
  );
}

export function buildDemoChatCompletionPayload(brief: string) {
  const lowSignalChat = isLowSignalChatPrompt(brief);

  return {
    model: V1_CHAT_MODEL,
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
      max_agents: lowSignalChat ? 1 : 3,
      max_latency_sec: lowSignalChat ? 20 : 60,
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

export function buildDemoModeLabel(mode: DemoRequestMode): string {
  return mode === 'chat_v1' ? 'v1 completions' : 'raid chat';
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
