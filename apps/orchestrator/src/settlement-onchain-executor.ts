import { DEFAULTS } from '@bossraid/constants';
import { buildChildJobNextAction, isTerminalChildJobStatus } from '@bossraid/raid-core';
import type { RaidRecord, SettlementExecutionRecord } from '@bossraid/shared-types';
import {
  defineChain,
  getAddress,
  http,
  parseEventLogs,
  createPublicClient,
  createWalletClient,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  buildArtifactPath,
  buildSettlementExecutionRecord,
  createExecutionPayload,
  getSuccessfulProviderIds,
  normalizeProviderAddressMap,
  readArtifactFile,
  toAtomicAmount,
  toBytes32,
  writeArtifactFile,
  type SettlementArtifact,
  type SettlementPayload,
} from './settlement-artifacts.js';
import { escrowAbi, registryAbi } from './settlement-onchain-abi.js';

export const DEFAULT_JOB_EXPIRY_SEC = DEFAULTS.SETTLEMENT_JOB_EXPIRY_SEC;

export type SettlementExecuteOptions = {
  providerAddressMap?: Record<string, string | null | undefined>;
};

type WalletActor = {
  account: ReturnType<typeof privateKeyToAccount>;
  client: ReturnType<typeof createWalletClient>;
  address: Address;
};

type OnchainExecutionState = {
  payload: SettlementPayload;
  raidRecordId: string;
  raidId: bigint;
  transactionHashes: Hash[];
  childJobs: SettlementArtifact['childJobs'];
  jobIds: string[];
  warnings: string[];
  finalizeTxHash?: Hash;
};

export class OnchainSettlementExecutor {
  private readonly publicClient;
  private readonly clientActor;
  private readonly evaluatorActor?: WalletActor;
  private readonly providerActors: Record<string, WalletActor>;
  private readonly chain;
  private readonly jobExpirySec: number;
  private readonly atomicMultiplier: bigint;
  private readonly fundJobs: boolean;
  private readonly requireTerminalJobs: boolean;
  private readonly providerAddressMap: Record<string, Address>;
  private readonly clientAddress: Address;

  constructor(
    private readonly outputDir: string,
    private readonly config: {
      rpcUrl: string;
      registryAddress: Address;
      escrowAddress: Address;
      tokenAddress?: string;
      evaluatorAddress: Address;
      privateKey: Hex;
      chainId?: string;
      jobExpirySec?: string;
      atomicMultiplier?: string;
      fundJobs?: string;
      providerAddressMapJson?: string;
      evaluatorPrivateKey?: string;
      providerPrivateKeysJson?: string;
      requireTerminalJobs?: string;
    }
  ) {
    this.chain = config.chainId
      ? defineChain({
          id: Number(config.chainId),
          name: 'bossraid',
          nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18,
          },
          rpcUrls: {
            default: {
              http: [config.rpcUrl],
            },
          },
        })
      : undefined;
    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(config.rpcUrl),
    });
    this.clientActor = createWalletActor({
      privateKey: config.privateKey,
      chain: this.chain,
      rpcUrl: config.rpcUrl,
    });
    this.clientAddress = this.clientActor.address;
    this.jobExpirySec = Number(config.jobExpirySec ?? String(DEFAULT_JOB_EXPIRY_SEC));
    this.atomicMultiplier = parseAtomicMultiplier(config.atomicMultiplier);
    this.fundJobs = parseBoolean(config.fundJobs);
    this.requireTerminalJobs = parseBoolean(config.requireTerminalJobs);
    this.providerAddressMap = parseProviderAddressMap(config.providerAddressMapJson);
    this.providerActors = parseProviderActors(config.providerPrivateKeysJson, {
      chain: this.chain,
      rpcUrl: config.rpcUrl,
      providerAddressMap: this.providerAddressMap,
    });
    this.evaluatorActor = resolveEvaluatorActor(config, {
      chain: this.chain,
      rpcUrl: config.rpcUrl,
      clientActor: this.clientActor,
    });
  }

  async execute(
    raid: RaidRecord,
    options?: SettlementExecuteOptions
  ): Promise<SettlementExecutionRecord | undefined> {
    const payload = createExecutionPayload(raid);
    if (!payload) {
      return undefined;
    }

    const transactionHashes: Hash[] = [];
    const createRaidHash = await this.clientActor.client.writeContract({
      chain: this.chain,
      address: this.config.registryAddress,
      abi: registryAbi,
      functionName: 'createRaid',
      args: [payload.taskHash],
      account: this.clientActor.account,
    });
    transactionHashes.push(createRaidHash);

    const createRaidReceipt = await this.waitForReceipt(createRaidHash);
    const raidId = extractUintEventArg(
      parseEventLogs({
        abi: registryAbi,
        logs: createRaidReceipt.logs,
        eventName: 'RaidCreated',
      }),
      'raidId',
      'RaidCreated'
    );

    const state: OnchainExecutionState = {
      payload,
      raidRecordId: raid.id,
      raidId,
      transactionHashes,
      childJobs: [],
      jobIds: [],
      warnings: [],
    };
    await this.checkpoint(raid, state);

    return this.runChildJobsAndFinalize(raid, state, options);
  }

  async resume(
    raid: RaidRecord,
    existing: SettlementExecutionRecord,
    options?: SettlementExecuteOptions
  ): Promise<SettlementExecutionRecord | undefined> {
    if (existing.mode !== 'onchain' || existing.lifecycleStatus === 'terminal') {
      return existing.lifecycleStatus === 'terminal' ? existing : undefined;
    }

    const payload = createExecutionPayload(raid);
    if (!payload) {
      return undefined;
    }

    const artifact =
      (await readArtifactFile(existing.artifactPath)) ??
      ({
        raidId: raid.id,
        executedAt: existing.executedAt,
        mode: 'onchain',
        lifecycleStatus: existing.lifecycleStatus,
        registryRaidRef: existing.registryRaidRef,
        taskHash: existing.taskHash,
        evaluationHash: existing.evaluationHash,
        successfulProviderIds: existing.successfulProviderIds,
        synthesizedOutput: raid.synthesizedOutput,
        settlement: payload.summary,
        allocations: existing.allocations,
        contracts: existing.contracts,
        registryCall: existing.registryCall,
        childJobs: existing.childJobs,
        finalizeTxHash: existing.finalizeTxHash,
        transactionHashes: existing.transactionHashes,
        jobIds: existing.jobIds,
        warnings: existing.warnings,
      } satisfies SettlementArtifact);

    const state: OnchainExecutionState = {
      payload,
      raidRecordId: raid.id,
      raidId: BigInt(existing.registryRaidRef),
      transactionHashes: [...(existing.transactionHashes ?? [])] as Hash[],
      childJobs: [],
      jobIds: [...(existing.jobIds ?? [])],
      warnings: [...(existing.warnings ?? [])],
      finalizeTxHash: existing.finalizeTxHash as Hash | undefined,
    };

    const existingChildJobsByProvider = new Map(
      artifact.childJobs.map((childJob) => [childJob.providerId, childJob])
    );

    for (const allocation of payload.allocations) {
      const existingChildJob = existingChildJobsByProvider.get(allocation.providerId);
      if (existingChildJob && isTerminalChildJobStatus(existingChildJob.lifecycleStatus)) {
        state.childJobs.push(existingChildJob);
        continue;
      }

      const childJob = await this.processAllocation(allocation, state, existingChildJob, options);
      state.childJobs.push(childJob);
      await this.checkpoint(raid, state);
    }

    return this.finalizeExecution(raid, state);
  }

  private async runChildJobsAndFinalize(
    raid: RaidRecord,
    state: OnchainExecutionState,
    options?: SettlementExecuteOptions
  ): Promise<SettlementExecutionRecord | undefined> {
    for (const allocation of state.payload.allocations) {
      const childJob = await this.processAllocation(allocation, state, undefined, options);
      state.childJobs.push(childJob);
      await this.checkpoint(raid, state);
    }

    return this.finalizeExecution(raid, state);
  }

  private async finalizeExecution(
    raid: RaidRecord,
    state: OnchainExecutionState
  ): Promise<SettlementExecutionRecord> {
    const allChildJobsTerminal = state.childJobs.every((childJob) =>
      isTerminalChildJobStatus(childJob.lifecycleStatus)
    );

    if (!state.finalizeTxHash && (allChildJobsTerminal || !this.requireTerminalJobs)) {
      const finalizeTxHash = await this.clientActor.client.writeContract({
        chain: this.chain,
        address: this.config.registryAddress,
        abi: registryAbi,
        functionName: 'finalizeRaid',
        args: [state.raidId, state.payload.evaluationHash],
        account: this.clientActor.account,
      });
      state.transactionHashes.push(finalizeTxHash);
      await this.waitForReceipt(finalizeTxHash);
      state.finalizeTxHash = finalizeTxHash;
    } else if (!state.finalizeTxHash) {
      state.warnings.push(
        'Parent raid was not finalized because at least one child job is not terminal.'
      );
    }

    const artifactPath = buildArtifactPath(this.outputDir, raid.id);
    const lifecycleStatus: SettlementArtifact['lifecycleStatus'] =
      allChildJobsTerminal && state.finalizeTxHash ? 'terminal' : 'partial';
    const artifact = this.buildArtifact(raid, state, lifecycleStatus);
    await writeArtifactFile(artifactPath, artifact);

    return buildSettlementExecutionRecord({
      mode: 'onchain',
      lifecycleStatus: artifact.lifecycleStatus,
      executedAt: state.payload.executedAt,
      artifactPath,
      registryRaidRef: state.raidId.toString(),
      taskHash: state.payload.taskHash,
      evaluationHash: state.payload.evaluationHash,
      allocations: state.payload.allocations,
      artifact,
      extras: {
        finalizeTxHash: state.finalizeTxHash,
        transactionHashes: state.transactionHashes,
        jobIds: state.jobIds,
      },
    });
  }

  private async checkpoint(raid: RaidRecord, state: OnchainExecutionState): Promise<void> {
    const artifactPath = buildArtifactPath(this.outputDir, raid.id);
    const artifact = this.buildArtifact(raid, state, 'partial');
    await writeArtifactFile(artifactPath, artifact);
  }

  private buildArtifact(
    raid: RaidRecord,
    state: OnchainExecutionState,
    lifecycleStatus: SettlementArtifact['lifecycleStatus']
  ): SettlementArtifact {
    return {
      raidId: raid.id,
      executedAt: state.payload.executedAt,
      mode: 'onchain',
      lifecycleStatus,
      registryRaidRef: state.raidId.toString(),
      taskHash: state.payload.taskHash,
      evaluationHash: state.payload.evaluationHash,
      successfulProviderIds: getSuccessfulProviderIds(state.payload.allocations),
      synthesizedOutput: raid.synthesizedOutput,
      settlement: state.payload.summary,
      allocations: state.payload.allocations,
      contracts: {
        registryAddress: this.config.registryAddress,
        escrowAddress: this.config.escrowAddress,
        tokenAddress: this.config.tokenAddress ?? null,
        clientAddress: this.clientAddress,
        evaluatorAddress: this.config.evaluatorAddress,
        chainId: this.config.chainId ?? null,
        rpcUrl: this.config.rpcUrl,
      },
      registryCall: {
        method: 'finalizeRaid',
        args: [state.raidId.toString(), state.payload.evaluationHash],
      },
      childJobs: state.childJobs,
      finalizeTxHash: state.finalizeTxHash,
      transactionHashes: state.transactionHashes,
      jobIds: state.jobIds,
      warnings: state.warnings.length > 0 ? state.warnings : undefined,
    };
  }

  private async processAllocation(
    allocation: SettlementPayload['allocations'][number],
    state: OnchainExecutionState,
    existingChildJob: SettlementArtifact['childJobs'][number] | undefined,
    options?: SettlementExecuteOptions
  ): Promise<SettlementArtifact['childJobs'][number]> {
    const runtimeProviderAddressMap = normalizeProviderAddressMap(options?.providerAddressMap);
    const providerActor = this.providerActors[allocation.providerId];
    const providerAddress =
      (existingChildJob?.providerAddress as Address | undefined) ??
      providerActor?.address ??
      this.providerAddressMap[allocation.providerId] ??
      runtimeProviderAddressMap[allocation.providerId] ??
      zeroAddress;
    const budgetAtomic = toAtomicAmount(allocation.totalAmount, this.atomicMultiplier);

    let jobId: bigint;
    let createJobHash: Hash | undefined = existingChildJob?.createTxHash as Hash | undefined;

    if (existingChildJob?.jobId) {
      jobId = BigInt(existingChildJob.jobId);
    } else {
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + this.jobExpirySec);
      createJobHash = await this.clientActor.client.writeContract({
        chain: this.chain,
        address: this.config.escrowAddress,
        abi: escrowAbi,
        functionName: 'createJob',
        args: [
          providerAddress,
          this.config.evaluatorAddress,
          expiresAt,
          `${state.raidRecordId}:${allocation.providerId}:${allocation.role}`,
        ],
        account: this.clientActor.account,
      });
      state.transactionHashes.push(createJobHash);

      const createJobReceipt = await this.waitForReceipt(createJobHash);
      jobId = extractUintEventArg(
        parseEventLogs({
          abi: escrowAbi,
          logs: createJobReceipt.logs,
          eventName: 'JobCreated',
        }),
        'jobId',
        'JobCreated'
      );
      state.jobIds.push(jobId.toString());
    }

    const childJob: SettlementArtifact['childJobs'][number] = {
      jobRef: existingChildJob?.jobRef ?? `${state.raidRecordId}:${allocation.providerId}`,
      providerId: allocation.providerId,
      providerAddress,
      role: allocation.role,
      status: allocation.status,
      requestedAction: allocation.status,
      lifecycleStatus: existingChildJob?.lifecycleStatus ?? 'open',
      budgetUsd: allocation.totalAmount,
      budgetAtomic: budgetAtomic.toString(),
      submitResultHash: allocation.deliverableHash ?? null,
      completionPolicy:
        allocation.status === 'complete'
          ? 'submit deliverable and complete child job'
          : 'reject child job from the open state',
      nextAction: existingChildJob?.nextAction ?? null,
      jobId: jobId.toString(),
      createTxHash: createJobHash ?? existingChildJob?.createTxHash,
      budgetTxHash: existingChildJob?.budgetTxHash,
      fundTxHash: existingChildJob?.fundTxHash,
      linkTxHash: existingChildJob?.linkTxHash,
      submitTxHash: existingChildJob?.submitTxHash,
      completeTxHash: existingChildJob?.completeTxHash,
      rejectTxHash: existingChildJob?.rejectTxHash,
    };

    if (allocation.status === 'complete' && budgetAtomic > 0n) {
      if (!childJob.budgetTxHash) {
        const budgetTxHash = await this.clientActor.client.writeContract({
          chain: this.chain,
          address: this.config.escrowAddress,
          abi: escrowAbi,
          functionName: 'setBudget',
          args: [jobId, budgetAtomic],
          account: this.clientActor.account,
        });
        state.transactionHashes.push(budgetTxHash);
        await this.waitForReceipt(budgetTxHash);
        childJob.budgetTxHash = budgetTxHash;
      }

      if (this.fundJobs && providerAddress !== zeroAddress && !childJob.fundTxHash) {
        const fundTxHash = await this.clientActor.client.writeContract({
          chain: this.chain,
          address: this.config.escrowAddress,
          abi: escrowAbi,
          functionName: 'fund',
          args: [jobId, budgetAtomic],
          account: this.clientActor.account,
        });
        state.transactionHashes.push(fundTxHash);
        await this.waitForReceipt(fundTxHash);
        childJob.fundTxHash = fundTxHash;
        childJob.lifecycleStatus = 'funded';
      }
    }

    if (!childJob.linkTxHash) {
      const linkTxHash = await this.clientActor.client.writeContract({
        chain: this.chain,
        address: this.config.registryAddress,
        abi: registryAbi,
        functionName: 'linkChildJob',
        args: [state.raidId, jobId],
        account: this.clientActor.account,
      });
      state.transactionHashes.push(linkTxHash);
      await this.waitForReceipt(linkTxHash);
      childJob.linkTxHash = linkTxHash;
    }

    if (allocation.status === 'reject' && !childJob.rejectTxHash) {
      const rejectTxHash = await this.clientActor.client.writeContract({
        chain: this.chain,
        address: this.config.escrowAddress,
        abi: escrowAbi,
        functionName: 'reject',
        args: [jobId, state.payload.evaluationHash],
        account: this.clientActor.account,
      });
      state.transactionHashes.push(rejectTxHash);
      await this.waitForReceipt(rejectTxHash);
      childJob.rejectTxHash = rejectTxHash;
      childJob.lifecycleStatus = 'rejected';
      return childJob;
    }

    if (allocation.status === 'reject') {
      return childJob;
    }

    if (budgetAtomic <= 0n) {
      childJob.nextAction = 'Successful child job has zero budget and cannot be funded.';
      state.warnings.push(`${allocation.providerId}: successful child job has zero budget.`);
      return childJob;
    }

    if (!this.fundJobs) {
      childJob.nextAction = 'Enable BOSSRAID_SETTLEMENT_FUND_JOBS to escrow successful child jobs.';
      state.warnings.push(
        `${allocation.providerId}: successful child job was left open because funding is disabled.`
      );
      return childJob;
    }

    if (providerAddress === zeroAddress) {
      childJob.nextAction =
        'Configure a provider onchain address or private key before funding successful child jobs.';
      state.warnings.push(
        `${allocation.providerId}: successful child job is missing a provider address.`
      );
      return childJob;
    }

    if (!childJob.fundTxHash) {
      childJob.nextAction = 'Client funding failed before the provider could submit.';
      state.warnings.push(
        `${allocation.providerId}: successful child job did not reach Funded state.`
      );
      return childJob;
    }

    if (!childJob.submitTxHash) {
      if (!providerActor) {
        childJob.nextAction = buildChildJobNextAction('complete', 'funded', budgetAtomic);
        state.warnings.push(
          `${allocation.providerId}: successful child job is funded but still awaiting provider submit.`
        );
        return childJob;
      }

      const submitTxHash = await providerActor.client.writeContract({
        chain: this.chain,
        address: this.config.escrowAddress,
        abi: escrowAbi,
        functionName: 'submit',
        args: [
          jobId,
          allocation.deliverableHash
            ? toBytes32(allocation.deliverableHash)
            : state.payload.evaluationHash,
        ],
        account: providerActor.account,
      });
      state.transactionHashes.push(submitTxHash);
      await this.waitForReceipt(submitTxHash);
      childJob.submitTxHash = submitTxHash;
      childJob.lifecycleStatus = 'submitted';
    }

    if (!childJob.completeTxHash) {
      if (!this.evaluatorActor) {
        childJob.nextAction = buildChildJobNextAction('complete', 'submitted', budgetAtomic);
        state.warnings.push(
          `${allocation.providerId}: successful child job is submitted but still awaiting evaluator completion.`
        );
        return childJob;
      }

      const completeTxHash = await this.evaluatorActor.client.writeContract({
        chain: this.chain,
        address: this.config.escrowAddress,
        abi: escrowAbi,
        functionName: 'complete',
        args: [jobId, state.payload.evaluationHash],
        account: this.evaluatorActor.account,
      });
      state.transactionHashes.push(completeTxHash);
      await this.waitForReceipt(completeTxHash);
      childJob.completeTxHash = completeTxHash;
      childJob.lifecycleStatus = 'completed';
    }

    return childJob;
  }

  private async waitForReceipt(hash: Hash) {
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') {
      throw new Error(`Settlement transaction failed: ${hash}`);
    }

    return receipt;
  }
}

export function normalizePrivateKey(value: string): Hex {
  return (value.startsWith('0x') ? value : `0x${value}`) as Hex;
}

function parseBoolean(value: string | undefined): boolean {
  return value === '1' || value === 'true' || value === 'yes';
}

function parseAtomicMultiplier(value: string | undefined): bigint {
  if (!value) {
    return 1_000_000n;
  }

  return BigInt(value);
}

function createWalletActor(config: {
  privateKey: Hex;
  chain?: ReturnType<typeof defineChain>;
  rpcUrl: string;
}): WalletActor {
  const account = privateKeyToAccount(config.privateKey);
  return {
    account,
    address: account.address,
    client: createWalletClient({
      account,
      chain: config.chain,
      transport: http(config.rpcUrl),
    }),
  };
}

function parseProviderPrivateKeyMap(value: string | undefined): Record<string, Hex> {
  if (!value) {
    return {};
  }

  const parsed = JSON.parse(value) as Record<string, string>;
  return Object.fromEntries(
    Object.entries(parsed).map(([providerId, privateKey]) => [
      providerId,
      normalizePrivateKey(privateKey),
    ])
  );
}

function extractUintEventArg(
  events: Array<{ args?: Record<string, unknown> }>,
  field: string,
  eventName: string
): bigint {
  const value = events[0]?.args?.[field];
  if (typeof value !== 'bigint') {
    throw new Error(`Missing ${field} in ${eventName} event.`);
  }

  return value;
}

function parseProviderAddressMap(value: string | undefined): Record<string, Address> {
  if (!value) {
    return {};
  }

  const parsed = JSON.parse(value) as Record<string, string>;
  return Object.fromEntries(
    Object.entries(parsed).map(([providerId, address]) => [providerId, getAddress(address)])
  );
}

function parseProviderActors(
  value: string | undefined,
  options: {
    chain?: ReturnType<typeof defineChain>;
    rpcUrl: string;
    providerAddressMap: Record<string, Address>;
  }
): Record<string, WalletActor> {
  const privateKeys = parseProviderPrivateKeyMap(value);
  return Object.fromEntries(
    Object.entries(privateKeys).map(([providerId, privateKey]) => {
      const actor = createWalletActor({
        privateKey,
        chain: options.chain,
        rpcUrl: options.rpcUrl,
      });
      const mappedAddress = options.providerAddressMap[providerId];
      if (mappedAddress && mappedAddress !== actor.address) {
        throw new Error(
          `Provider signing key for ${providerId} does not match BOSSRAID_PROVIDER_ADDRESS_MAP_JSON (${mappedAddress} != ${actor.address}).`
        );
      }
      return [providerId, actor];
    })
  );
}

function resolveEvaluatorActor(
  config: {
    rpcUrl: string;
    evaluatorAddress: Address;
    evaluatorPrivateKey?: string;
  },
  options: {
    chain?: ReturnType<typeof defineChain>;
    rpcUrl: string;
    clientActor: WalletActor;
  }
): WalletActor | undefined {
  if (config.evaluatorAddress === options.clientActor.address) {
    return options.clientActor;
  }

  if (!config.evaluatorPrivateKey) {
    return undefined;
  }

  const actor = createWalletActor({
    privateKey: normalizePrivateKey(config.evaluatorPrivateKey),
    chain: options.chain,
    rpcUrl: options.rpcUrl,
  });
  if (actor.address !== config.evaluatorAddress) {
    throw new Error(
      `BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY does not match BOSSRAID_EVALUATOR_ADDRESS (${actor.address} != ${config.evaluatorAddress}).`
    );
  }
  return actor;
}
