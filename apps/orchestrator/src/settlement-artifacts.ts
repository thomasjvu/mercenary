import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { sha256 } from '@bossraid/raid-core';
import type {
  PrivacyComplianceRecord,
  RaidRecord,
  SettlementExecutionRecord,
} from '@bossraid/shared-types';
import { getAddress, type Address, type Hex } from 'viem';
import { buildSettlementAllocations, buildSettlementSummary } from './settlement.js';

export type SettlementPayload = {
  executedAt: string;
  taskHash: Hex;
  evaluationHash: Hex;
  allocations: ReturnType<typeof buildSettlementAllocations>;
  summary: NonNullable<ReturnType<typeof buildSettlementSummary>>;
};

export type SettlementArtifact = {
  raidId: string;
  executedAt: string;
  mode: 'file' | 'onchain';
  lifecycleStatus: 'synthetic' | 'partial' | 'terminal';
  registryRaidRef: string;
  taskHash: string;
  evaluationHash: string;
  successfulProviderIds: string[];
  synthesizedOutput?: RaidRecord['synthesizedOutput'];
  settlement: NonNullable<SettlementPayload['summary']>;
  allocations: SettlementPayload['allocations'];
  contracts: {
    registryAddress: string | null;
    escrowAddress: string | null;
    tokenAddress: string | null;
    clientAddress: string | null;
    evaluatorAddress: string | null;
    chainId: string | null;
    rpcUrl?: string | null;
  };
  registryCall: {
    method: 'finalizeRaid';
    args: [string, string];
  };
  childJobs: Array<{
    jobRef: string;
    providerId: string;
    providerAddress?: string | null;
    role: string;
    status: string;
    requestedAction: 'complete' | 'reject';
    lifecycleStatus:
      | 'synthetic'
      | 'open'
      | 'funded'
      | 'submitted'
      | 'completed'
      | 'rejected'
      | 'expired';
    budgetUsd: number;
    budgetAtomic?: string;
    submitResultHash: string | null;
    completionPolicy: string;
    nextAction?: string | null;
    syntheticJobId?: string;
    jobId?: string;
    createTxHash?: string;
    linkTxHash?: string;
    budgetTxHash?: string;
    fundTxHash?: string;
    submitTxHash?: string;
    completeTxHash?: string;
    rejectTxHash?: string;
  }>;
  finalizeTxHash?: string;
  transactionHashes?: string[];
  jobIds?: string[];
  warnings?: string[];
};

export function createExecutionPayload(raid: RaidRecord): SettlementPayload | undefined {
  const summary = buildSettlementSummary(raid);
  if (!summary) {
    return undefined;
  }

  const allocations = buildSettlementAllocations(raid);
  const executedAt = new Date().toISOString();
  const taskHash = toBytes32(sha256(JSON.stringify(raid.task)));
  const successfulProviderIds = getSuccessfulProviderIds(allocations);
  const evaluationHash = toBytes32(
    sha256(
      JSON.stringify({
        synthesizedOutput: raid.synthesizedOutput,
        successfulProviderIds,
        allocations,
        rankedSubmissions: raid.rankedSubmissions.map((item) => ({
          providerId: item.submission.providerId,
          finalScore: item.breakdown.finalScore,
          valid: item.breakdown.valid,
        })),
      })
    )
  );

  return {
    executedAt,
    taskHash,
    evaluationHash,
    allocations,
    summary,
  };
}

export function toBytes32(value: string): Hex {
  const normalized = value.startsWith('0x') ? value.slice(2) : value;
  return `0x${normalized}` as Hex;
}

export { isTerminalChildJobStatus } from '@bossraid/raid-core';

export function toAtomicAmount(amount: number, multiplier: bigint): bigint {
  const micros = BigInt(Math.round(amount * 1_000_000));
  return (micros * multiplier) / 1_000_000n;
}

export function buildArtifactPath(outputDir: string, raidId: string): string {
  return resolve(outputDir, `${raidId}.settlement.json`);
}

export async function writeArtifactFile(
  artifactPath: string,
  artifact: SettlementArtifact
): Promise<void> {
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');
}

export function buildFileArtifact(
  raid: RaidRecord,
  payload: SettlementPayload,
  artifactPath: string,
  config: {
    registryAddress?: string;
    escrowAddress?: string;
    tokenAddress?: string;
    clientAddress?: string;
    evaluatorAddress?: string;
    chainId?: string;
    rpcUrl?: string;
  },
  providerAddressMap: Record<string, Address> = {}
): SettlementArtifact {
  return {
    raidId: raid.id,
    executedAt: payload.executedAt,
    mode: 'file',
    lifecycleStatus: 'synthetic',
    registryRaidRef: raid.id,
    taskHash: payload.taskHash,
    evaluationHash: payload.evaluationHash,
    successfulProviderIds: getSuccessfulProviderIds(payload.allocations),
    synthesizedOutput: raid.synthesizedOutput,
    settlement: payload.summary,
    allocations: payload.allocations,
    contracts: {
      registryAddress: config.registryAddress ?? null,
      escrowAddress: config.escrowAddress ?? null,
      tokenAddress: config.tokenAddress ?? null,
      clientAddress: config.clientAddress ?? null,
      evaluatorAddress: config.evaluatorAddress ?? null,
      chainId: config.chainId ?? null,
      rpcUrl: config.rpcUrl ?? null,
    },
    registryCall: {
      method: 'finalizeRaid',
      args: [raid.id, payload.evaluationHash],
    },
    childJobs: payload.allocations.map((allocation, index) => ({
      jobRef: `${raid.id}:${allocation.providerId}`,
      providerId: allocation.providerId,
      ...(providerAddressMap[allocation.providerId]
        ? { providerAddress: providerAddressMap[allocation.providerId] }
        : {}),
      role: allocation.role,
      status: allocation.status,
      requestedAction: allocation.status,
      lifecycleStatus: 'synthetic',
      budgetUsd: allocation.totalAmount,
      submitResultHash: allocation.deliverableHash ?? null,
      completionPolicy:
        allocation.status === 'complete'
          ? 'complete child job and release payout'
          : 'reject child job and refund allocation',
      nextAction: 'Switch to onchain settlement mode to create ERC-8183 child jobs.',
      syntheticJobId: `${raid.id}-job-${index + 1}`,
    })),
    warnings: ['Settlement proof is synthetic in file mode.'],
  };
}

export function buildSettlementExecutionRecord(input: {
  mode: 'file' | 'onchain';
  lifecycleStatus: SettlementExecutionRecord['lifecycleStatus'];
  executedAt: string;
  artifactPath: string;
  registryRaidRef: string;
  taskHash: string;
  evaluationHash: string;
  allocations: SettlementPayload['allocations'];
  artifact: Pick<SettlementArtifact, 'contracts' | 'registryCall' | 'childJobs' | 'warnings'>;
  extras?: Partial<SettlementExecutionRecord>;
}): SettlementExecutionRecord {
  return {
    mode: input.mode,
    proofStandard: 'erc8183_aligned',
    lifecycleStatus: input.lifecycleStatus,
    executedAt: input.executedAt,
    artifactPath: input.artifactPath,
    registryRaidRef: input.registryRaidRef,
    taskHash: input.taskHash,
    evaluationHash: input.evaluationHash,
    successfulProviderIds: getSuccessfulProviderIds(input.allocations),
    allocations: input.allocations,
    contracts: input.artifact.contracts,
    registryCall: input.artifact.registryCall,
    childJobs: input.artifact.childJobs,
    warnings: input.artifact.warnings,
    ...input.extras,
  };
}

export function buildPrivacyFailureSettlementRecord(
  raid: RaidRecord,
  complianceRecord: PrivacyComplianceRecord
): SettlementExecutionRecord {
  return {
    mode: 'file',
    proofStandard: 'erc8183_aligned',
    lifecycleStatus: 'synthetic',
    executedAt: new Date().toISOString(),
    artifactPath: '',
    registryRaidRef: raid.id,
    taskHash: '',
    evaluationHash: '',
    successfulProviderIds: [],
    privacyCompliance: complianceRecord,
    allocations: [],
    contracts: {
      registryAddress: null,
      escrowAddress: null,
      tokenAddress: null,
      clientAddress: null,
      evaluatorAddress: null,
      chainId: null,
      rpcUrl: null,
    },
    registryCall: {
      method: 'finalizeRaid',
      args: [raid.id, '0x0000000000000000000000000000000000000000'],
    },
    childJobs: [],
    warnings: ['privacy-compliance-failed'],
  };
}

export function getSuccessfulProviderIds(
  allocations: ReturnType<typeof buildSettlementAllocations>
): string[] {
  return allocations
    .filter((allocation) => allocation.status === 'complete')
    .map((allocation) => allocation.providerId);
}

export function normalizeProviderAddressMap(
  value: Record<string, string | null | undefined> | undefined
): Record<string, Address> {
  if (!value) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
      .map(([providerId, address]) => [providerId, getAddress(address)])
  );
}
