import { createHash, randomUUID } from 'node:crypto';
import { type BossRaidOrchestrator } from '@bossraid/orchestrator';
import { readStorageBackend } from '@bossraid/constants';
import { type BossRaidResultOutput, type ProviderHealthStatus } from '@bossraid/shared-types';
import { runtimeExecutionTransport } from '@bossraid/sandbox-runner';

export interface AttestedRuntimePayload {
  version: 1;
  nonce: string;
  timestamp: string;
  deploymentTarget: string | null;
  teePlatform: string | null;
  storageBackend: string;
  providers: number;
  readyProviders: number;
  raids: number;
  evaluatorTransport: string;
  workerIsolation: 'per_job_process' | 'per_job_container';
}

export interface AttestedRaidResultPayload {
  version: 1;
  nonce: string;
  timestamp: string;
  deploymentTarget: string | null;
  teePlatform: string | null;
  evaluatorTransport: string;
  workerIsolation: 'per_job_process' | 'per_job_container';
  raidId: string;
  status: BossRaidResultOutput['status'];
  approvedSubmissionCount: number;
  resultHash: `0x${string}`;
  result: BossRaidResultOutput;
}

export function buildAttestedRuntimePayload(
  env: NodeJS.ProcessEnv,
  orchestrator: BossRaidOrchestrator,
  providerHealth: ProviderHealthStatus[],
  workerIsolation: 'per_job_process' | 'per_job_container'
): AttestedRuntimePayload {
  return {
    version: 1,
    nonce: randomUUID(),
    timestamp: new Date().toISOString(),
    deploymentTarget: env.BOSSRAID_DEPLOY_TARGET ?? null,
    teePlatform: env.BOSSRAID_TEE_PLATFORM ?? null,
    storageBackend: readStorageBackend(env),
    providers: orchestrator.listProviders().length,
    readyProviders: providerHealth.filter((provider) => provider.ready).length,
    raids: orchestrator.listRaids().length,
    evaluatorTransport: runtimeExecutionTransport(env),
    workerIsolation,
  };
}

export function buildAttestedRuntimeMessage(payload: AttestedRuntimePayload): string {
  return [
    'BossRaidAttestedRuntime',
    `version=${payload.version}`,
    `nonce=${payload.nonce}`,
    `timestamp=${payload.timestamp}`,
    `deploymentTarget=${payload.deploymentTarget ?? 'unknown'}`,
    `teePlatform=${payload.teePlatform ?? 'unknown'}`,
    `storageBackend=${payload.storageBackend}`,
    `providers=${payload.providers}`,
    `readyProviders=${payload.readyProviders}`,
    `raids=${payload.raids}`,
    `evaluatorTransport=${payload.evaluatorTransport}`,
    `workerIsolation=${payload.workerIsolation}`,
  ].join('|');
}

export function buildAttestedRaidResultPayload(
  env: NodeJS.ProcessEnv,
  result: BossRaidResultOutput,
  workerIsolation: 'per_job_process' | 'per_job_container'
): AttestedRaidResultPayload {
  return {
    version: 1,
    nonce: randomUUID(),
    timestamp: new Date().toISOString(),
    deploymentTarget: env.BOSSRAID_DEPLOY_TARGET ?? null,
    teePlatform: env.BOSSRAID_TEE_PLATFORM ?? null,
    evaluatorTransport: runtimeExecutionTransport(env),
    workerIsolation,
    raidId: result.raidId,
    status: result.status,
    approvedSubmissionCount: result.approvedSubmissions?.length ?? 0,
    resultHash: hashAttestationText(stableStringify(result)),
    result,
  };
}

export function buildAttestedRaidResultMessage(payload: AttestedRaidResultPayload): string {
  return [
    'BossRaidAttestedResult',
    `version=${payload.version}`,
    `nonce=${payload.nonce}`,
    `timestamp=${payload.timestamp}`,
    `deploymentTarget=${payload.deploymentTarget ?? 'unknown'}`,
    `teePlatform=${payload.teePlatform ?? 'unknown'}`,
    `evaluatorTransport=${payload.evaluatorTransport}`,
    `workerIsolation=${payload.workerIsolation}`,
    `raidId=${payload.raidId}`,
    `status=${payload.status}`,
    `approvedSubmissionCount=${payload.approvedSubmissionCount}`,
    `resultHash=${payload.resultHash}`,
  ].join('|');
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortJsonValue(entryValue)])
    );
  }

  return value;
}

export function hashAttestationText(value: string): `0x${string}` {
  return `0x${createHash('sha256').update(value).digest('hex')}`;
}
