import { DEFAULTS } from '@bossraid/constants';
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
  createExecutionPayload,
  getSuccessfulProviderIds,
  isTerminalChildJobStatus,
  normalizeProviderAddressMap,
  toAtomicAmount,
  toBytes32,
  writeArtifactFile,
  type SettlementArtifact,
} from './settlement-artifacts.js';

export const DEFAULT_JOB_EXPIRY_SEC = DEFAULTS.SETTLEMENT_JOB_EXPIRY_SEC;

export type SettlementExecuteOptions = {
  providerAddressMap?: Record<string, string | null | undefined>;
};

const registryAbi = [
  {
    type: 'function',
    name: 'createRaid',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'taskHash', type: 'bytes32' }],
    outputs: [{ name: 'raidId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'linkChildJob',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'raidId', type: 'uint256' },
      { name: 'jobId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalizeRaid',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'raidId', type: 'uint256' },
      { name: 'evaluationHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'RaidCreated',
    inputs: [
      { name: 'raidId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'taskHash', type: 'bytes32', indexed: false },
    ],
  },
] as const;

const escrowAbi = [
  {
    type: 'function',
    name: 'createJob',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'provider', type: 'address' },
      { name: 'evaluator', type: 'address' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'description', type: 'string' },
    ],
    outputs: [{ name: 'jobId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'setBudget',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'fund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'expectedBudget', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'submit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'deliverableHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'complete',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'reason', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'reject',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'reason', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'JobCreated',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'provider', type: 'address', indexed: true },
      { name: 'evaluator', type: 'address', indexed: false },
    ],
  },
] as const;

type WalletActor = {
  account: ReturnType<typeof privateKeyToAccount>;
  client: ReturnType<typeof createWalletClient>;
  address: Address;
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
    const runtimeProviderAddressMap = normalizeProviderAddressMap(options?.providerAddressMap);

    const transactionHashes: string[] = [];
    const childJobs: SettlementArtifact['childJobs'] = [];
    const warnings: string[] = [];

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

    const jobIds: string[] = [];
    for (const allocation of payload.allocations) {
      const providerActor = this.providerActors[allocation.providerId];
      const providerAddress =
        providerActor?.address ??
        this.providerAddressMap[allocation.providerId] ??
        runtimeProviderAddressMap[allocation.providerId] ??
        zeroAddress;
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + this.jobExpirySec);
      const budgetAtomic = toAtomicAmount(allocation.totalAmount, this.atomicMultiplier);

      const createJobHash = await this.clientActor.client.writeContract({
        chain: this.chain,
        address: this.config.escrowAddress,
        abi: escrowAbi,
        functionName: 'createJob',
        args: [
          providerAddress,
          this.config.evaluatorAddress,
          expiresAt,
          `${raid.id}:${allocation.providerId}:${allocation.role}`,
        ],
        account: this.clientActor.account,
      });
      transactionHashes.push(createJobHash);

      const createJobReceipt = await this.waitForReceipt(createJobHash);
      const jobId = extractUintEventArg(
        parseEventLogs({
          abi: escrowAbi,
          logs: createJobReceipt.logs,
          eventName: 'JobCreated',
        }),
        'jobId',
        'JobCreated'
      );

      jobIds.push(jobId.toString());

      let budgetTxHash: Hash | undefined;
      let fundTxHash: Hash | undefined;
      let submitTxHash: Hash | undefined;
      let completeTxHash: Hash | undefined;
      let rejectTxHash: Hash | undefined;

      const childJob: SettlementArtifact['childJobs'][number] = {
        jobRef: `${raid.id}:${allocation.providerId}`,
        providerId: allocation.providerId,
        providerAddress,
        role: allocation.role,
        status: allocation.status,
        requestedAction: allocation.status,
        lifecycleStatus: 'open',
        budgetUsd: allocation.totalAmount,
        budgetAtomic: budgetAtomic.toString(),
        submitResultHash: allocation.deliverableHash ?? null,
        completionPolicy:
          allocation.status === 'complete'
            ? 'submit deliverable and complete child job'
            : 'reject child job from the open state',
        nextAction: null,
        jobId: jobId.toString(),
        createTxHash: createJobHash,
      };

      if (allocation.status === 'complete' && budgetAtomic > 0n) {
        budgetTxHash = await this.clientActor.client.writeContract({
          chain: this.chain,
          address: this.config.escrowAddress,
          abi: escrowAbi,
          functionName: 'setBudget',
          args: [jobId, budgetAtomic],
          account: this.clientActor.account,
        });
        transactionHashes.push(budgetTxHash);
        await this.waitForReceipt(budgetTxHash);
        childJob.budgetTxHash = budgetTxHash;

        if (this.fundJobs && providerAddress !== zeroAddress) {
          fundTxHash = await this.clientActor.client.writeContract({
            chain: this.chain,
            address: this.config.escrowAddress,
            abi: escrowAbi,
            functionName: 'fund',
            args: [jobId, budgetAtomic],
            account: this.clientActor.account,
          });
          transactionHashes.push(fundTxHash);
          await this.waitForReceipt(fundTxHash);
          childJob.fundTxHash = fundTxHash;
          childJob.lifecycleStatus = 'funded';
        }
      }

      const linkTxHash = await this.clientActor.client.writeContract({
        chain: this.chain,
        address: this.config.registryAddress,
        abi: registryAbi,
        functionName: 'linkChildJob',
        args: [raidId, jobId],
        account: this.clientActor.account,
      });
      transactionHashes.push(linkTxHash);
      await this.waitForReceipt(linkTxHash);
      childJob.linkTxHash = linkTxHash;

      if (allocation.status === 'reject') {
        rejectTxHash = await this.clientActor.client.writeContract({
          chain: this.chain,
          address: this.config.escrowAddress,
          abi: escrowAbi,
          functionName: 'reject',
          args: [jobId, payload.evaluationHash],
          account: this.clientActor.account,
        });
        transactionHashes.push(rejectTxHash);
        await this.waitForReceipt(rejectTxHash);
        childJob.rejectTxHash = rejectTxHash;
        childJob.lifecycleStatus = 'rejected';
        childJobs.push(childJob);
        continue;
      }

      if (budgetAtomic <= 0n) {
        childJob.nextAction = 'Successful child job has zero budget and cannot be funded.';
        warnings.push(`${allocation.providerId}: successful child job has zero budget.`);
        childJobs.push(childJob);
        continue;
      }

      if (!this.fundJobs) {
        childJob.nextAction =
          'Enable BOSSRAID_SETTLEMENT_FUND_JOBS to escrow successful child jobs.';
        warnings.push(
          `${allocation.providerId}: successful child job was left open because funding is disabled.`
        );
        childJobs.push(childJob);
        continue;
      }

      if (providerAddress === zeroAddress) {
        childJob.nextAction =
          'Configure a provider onchain address or private key before funding successful child jobs.';
        warnings.push(
          `${allocation.providerId}: successful child job is missing a provider address.`
        );
        childJobs.push(childJob);
        continue;
      }

      if (!fundTxHash) {
        childJob.nextAction = 'Client funding failed before the provider could submit.';
        warnings.push(`${allocation.providerId}: successful child job did not reach Funded state.`);
        childJobs.push(childJob);
        continue;
      }

      if (!providerActor) {
        childJob.nextAction = 'Provider submit is still required from the provider wallet.';
        warnings.push(
          `${allocation.providerId}: successful child job is funded but still awaiting provider submit.`
        );
        childJobs.push(childJob);
        continue;
      }

      submitTxHash = await providerActor.client.writeContract({
        chain: this.chain,
        address: this.config.escrowAddress,
        abi: escrowAbi,
        functionName: 'submit',
        args: [
          jobId,
          allocation.deliverableHash
            ? toBytes32(allocation.deliverableHash)
            : payload.evaluationHash,
        ],
        account: providerActor.account,
      });
      transactionHashes.push(submitTxHash);
      await this.waitForReceipt(submitTxHash);
      childJob.submitTxHash = submitTxHash;
      childJob.lifecycleStatus = 'submitted';

      if (!this.evaluatorActor) {
        childJob.nextAction =
          'Evaluator completion is still required from the configured evaluator wallet.';
        warnings.push(
          `${allocation.providerId}: successful child job is submitted but still awaiting evaluator completion.`
        );
        childJobs.push(childJob);
        continue;
      }

      completeTxHash = await this.evaluatorActor.client.writeContract({
        chain: this.chain,
        address: this.config.escrowAddress,
        abi: escrowAbi,
        functionName: 'complete',
        args: [jobId, payload.evaluationHash],
        account: this.evaluatorActor.account,
      });
      transactionHashes.push(completeTxHash);
      await this.waitForReceipt(completeTxHash);
      childJob.completeTxHash = completeTxHash;
      childJob.lifecycleStatus = 'completed';
      childJobs.push(childJob);
    }

    const allChildJobsTerminal = childJobs.every((childJob) =>
      isTerminalChildJobStatus(childJob.lifecycleStatus)
    );
    let finalizeTxHash: Hash | undefined;

    if (allChildJobsTerminal || !this.requireTerminalJobs) {
      finalizeTxHash = await this.clientActor.client.writeContract({
        chain: this.chain,
        address: this.config.registryAddress,
        abi: registryAbi,
        functionName: 'finalizeRaid',
        args: [raidId, payload.evaluationHash],
        account: this.clientActor.account,
      });
      transactionHashes.push(finalizeTxHash);
      await this.waitForReceipt(finalizeTxHash);
    } else {
      warnings.push(
        'Parent raid was not finalized because at least one child job is not terminal.'
      );
    }

    const artifactPath = buildArtifactPath(this.outputDir, raid.id);
    const artifact: SettlementArtifact = {
      raidId: raid.id,
      executedAt: payload.executedAt,
      mode: 'onchain',
      lifecycleStatus: allChildJobsTerminal && finalizeTxHash ? 'terminal' : 'partial',
      registryRaidRef: raidId.toString(),
      taskHash: payload.taskHash,
      evaluationHash: payload.evaluationHash,
      successfulProviderIds: getSuccessfulProviderIds(payload.allocations),
      synthesizedOutput: raid.synthesizedOutput,
      settlement: payload.summary,
      allocations: payload.allocations,
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
        args: [raidId.toString(), payload.evaluationHash],
      },
      childJobs,
      finalizeTxHash,
      transactionHashes,
      jobIds,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
    await writeArtifactFile(artifactPath, artifact);

    return {
      mode: 'onchain',
      proofStandard: 'erc8183_aligned',
      lifecycleStatus: artifact.lifecycleStatus,
      executedAt: payload.executedAt,
      artifactPath,
      registryRaidRef: raidId.toString(),
      taskHash: payload.taskHash,
      evaluationHash: payload.evaluationHash,
      successfulProviderIds: getSuccessfulProviderIds(payload.allocations),
      allocations: payload.allocations,
      contracts: artifact.contracts,
      registryCall: artifact.registryCall,
      childJobs: artifact.childJobs,
      finalizeTxHash,
      transactionHashes,
      jobIds,
      warnings: artifact.warnings,
    };
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
