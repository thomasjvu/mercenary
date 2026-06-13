import { tmpdir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import type { RaidRecord, SettlementExecutionRecord } from '@bossraid/shared-types';
import { getAddress } from 'viem';
import {
  buildArtifactPath,
  buildFileArtifact,
  buildSettlementExecutionRecord,
  createExecutionPayload,
  normalizeProviderAddressMap,
  writeArtifactFile,
} from './settlement-artifacts.js';
import {
  normalizePrivateKey,
  OnchainSettlementExecutor,
  type SettlementExecuteOptions,
} from './settlement-onchain-executor.js';

export type { SettlementExecuteOptions };

interface SettlementExecutor {
  execute(
    raid: RaidRecord,
    options?: SettlementExecuteOptions
  ): Promise<SettlementExecutionRecord | undefined>;
}

class NoopSettlementExecutor implements SettlementExecutor {
  async execute(): Promise<SettlementExecutionRecord | undefined> {
    return undefined;
  }
}

class FileSettlementExecutor implements SettlementExecutor {
  constructor(
    private readonly outputDir: string,
    private readonly config: {
      registryAddress?: string;
      escrowAddress?: string;
      tokenAddress?: string;
      clientAddress?: string;
      evaluatorAddress?: string;
      chainId?: string;
      rpcUrl?: string;
    }
  ) {}

  async execute(
    raid: RaidRecord,
    options?: SettlementExecuteOptions
  ): Promise<SettlementExecutionRecord | undefined> {
    const payload = createExecutionPayload(raid);
    if (!payload) {
      return undefined;
    }
    const artifactPath = buildArtifactPath(this.outputDir, raid.id);
    const artifact = buildFileArtifact(
      raid,
      payload,
      artifactPath,
      this.config,
      normalizeProviderAddressMap(options?.providerAddressMap)
    );
    await writeArtifactFile(artifactPath, artifact);

    return buildSettlementExecutionRecord({
      mode: 'file',
      lifecycleStatus: artifact.lifecycleStatus,
      executedAt: payload.executedAt,
      artifactPath,
      registryRaidRef: artifact.registryRaidRef,
      taskHash: payload.taskHash,
      evaluationHash: payload.evaluationHash,
      allocations: payload.allocations,
      artifact,
    });
  }
}

export function createSettlementExecutor(
  env: NodeJS.ProcessEnv,
  workspaceRoot: string
): SettlementExecutor {
  const mode = env.BOSSRAID_SETTLEMENT_MODE ?? 'file';
  if (mode === 'off') {
    return new NoopSettlementExecutor();
  }

  const outputDir = resolveSettlementOutputDir(workspaceRoot, env.BOSSRAID_SETTLEMENT_DIR);
  if (mode === 'onchain') {
    const treasuryKey = env.BOSSRAID_SETTLEMENT_TREASURY_KEY ?? env.BOSSRAID_CLIENT_PRIVATE_KEY;
    return new OnchainSettlementExecutor(outputDir, {
      rpcUrl: requireEnv(env.BOSSRAID_RPC_URL, 'BOSSRAID_RPC_URL'),
      registryAddress: getAddress(
        requireEnv(env.BOSSRAID_REGISTRY_ADDRESS, 'BOSSRAID_REGISTRY_ADDRESS')
      ),
      escrowAddress: getAddress(requireEnv(env.BOSSRAID_ESCROW_ADDRESS, 'BOSSRAID_ESCROW_ADDRESS')),
      tokenAddress: env.BOSSRAID_TOKEN_ADDRESS,
      evaluatorAddress: getAddress(
        requireEnv(env.BOSSRAID_EVALUATOR_ADDRESS, 'BOSSRAID_EVALUATOR_ADDRESS')
      ),
      privateKey: normalizePrivateKey(
        requireEnv(treasuryKey, 'BOSSRAID_SETTLEMENT_TREASURY_KEY or BOSSRAID_CLIENT_PRIVATE_KEY')
      ),
      chainId: env.BOSSRAID_CHAIN_ID,
      jobExpirySec: env.BOSSRAID_SETTLEMENT_JOB_EXPIRY_SEC,
      atomicMultiplier: env.BOSSRAID_SETTLEMENT_ATOMIC_MULTIPLIER,
      fundJobs: env.BOSSRAID_SETTLEMENT_FUND_JOBS,
      providerAddressMapJson: env.BOSSRAID_PROVIDER_ADDRESS_MAP_JSON,
      evaluatorPrivateKey: env.BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY,
      providerPrivateKeysJson: env.BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON,
      requireTerminalJobs: env.BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS,
    });
  }

  return new FileSettlementExecutor(outputDir, {
    registryAddress: env.BOSSRAID_REGISTRY_ADDRESS,
    escrowAddress: env.BOSSRAID_ESCROW_ADDRESS,
    tokenAddress: env.BOSSRAID_TOKEN_ADDRESS,
    clientAddress: env.BOSSRAID_CLIENT_ADDRESS,
    evaluatorAddress: env.BOSSRAID_EVALUATOR_ADDRESS,
    chainId: env.BOSSRAID_CHAIN_ID,
    rpcUrl: env.BOSSRAID_RPC_URL,
  });
}

function resolveSettlementOutputDir(
  workspaceRoot: string,
  configuredDir: string | undefined
): string {
  if (configuredDir && configuredDir.trim().length > 0) {
    return isAbsolute(configuredDir) ? configuredDir : resolve(workspaceRoot, configuredDir);
  }

  return resolve(tmpdir(), 'bossraid', 'settlements');
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}
