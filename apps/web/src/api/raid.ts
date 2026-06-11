import type {
  AttestedEnvelopeResponse,
  AttestedRaidResultPayloadResponse,
  AttestedRuntimePayloadResponse,
  ChatCompletionResponseView,
  RaidAgentLogResponse,
  RaidListItemResponse,
  RaidResultResponse,
  RaidSpawnOutputResponse,
  RaidStatusResponse,
  RankedSubmissionResponse,
} from '@bossraid/shared-types';
import {
  fetchJson,
  requestJsonDetailedWeb as requestJsonDetailed,
  RAID_ACCESS_TOKEN_HEADER,
  type ApiResponse,
} from './client.js';

export type RaidListItem = RaidListItemResponse;
export type RaidStatus = RaidStatusResponse;
export type RaidResult = RaidResultResponse;
export type RankedSubmission = RankedSubmissionResponse;
export type RaidAgentLog = RaidAgentLogResponse;
export type AttestedEnvelope<TPayload> = AttestedEnvelopeResponse<TPayload>;
export type AttestedRuntimePayload = AttestedRuntimePayloadResponse;
export type AttestedRaidResultPayload = AttestedRaidResultPayloadResponse;
export type RaidSpawnOutput = RaidSpawnOutputResponse;
export type ChatCompletionResponse = ChatCompletionResponseView;

export async function spawnDemoRaid(payload: unknown): Promise<ApiResponse<RaidSpawnOutput>> {
  return requestJsonDetailed<RaidSpawnOutput>('/v1/demo/raid', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export async function requestChatCompletion(
  payload: unknown
): Promise<ApiResponse<ChatCompletionResponse>> {
  return requestJsonDetailed<ChatCompletionResponse>('/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function raidTokenHeaders(raidAccessToken: string): Record<string, string> {
  return {
    [RAID_ACCESS_TOKEN_HEADER]: raidAccessToken,
  };
}

export async function fetchRaidStatus(
  raidId: string,
  raidAccessToken: string
): Promise<RaidStatus> {
  return fetchJson<RaidStatus>(`/v1/raids/${encodeURIComponent(raidId)}`, {
    headers: raidTokenHeaders(raidAccessToken),
  });
}

export async function fetchRaidResult(
  raidId: string,
  raidAccessToken: string
): Promise<RaidResult> {
  return fetchJson<RaidResult>(`/v1/raids/${encodeURIComponent(raidId)}/result`, {
    headers: raidTokenHeaders(raidAccessToken),
  });
}

export async function fetchRaidAgentLog(
  raidId: string,
  raidAccessToken: string
): Promise<RaidAgentLog> {
  return fetchJson<RaidAgentLog>(
    `/v1/raids/${encodeURIComponent(raidId)}/agent_log.json?token=${encodeURIComponent(raidAccessToken)}`
  );
}

export async function fetchAttestedRuntime(): Promise<AttestedEnvelope<AttestedRuntimePayload>> {
  return fetchJson<AttestedEnvelope<AttestedRuntimePayload>>('/v1/attested-runtime');
}

export async function fetchAttestedRaidResult(
  raidId: string,
  raidAccessToken: string
): Promise<AttestedEnvelope<AttestedRaidResultPayload>> {
  return fetchJson<AttestedEnvelope<AttestedRaidResultPayload>>(
    `/v1/raid/${encodeURIComponent(raidId)}/attested-result`,
    {
      headers: raidTokenHeaders(raidAccessToken),
    }
  );
}
