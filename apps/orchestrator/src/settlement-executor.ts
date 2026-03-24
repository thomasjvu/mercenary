import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { sha256 } from "@bossraid/raid-core";
import type { RaidRecord, SettlementExecutionRecord } from "@bossraid/shared-types";
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
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildSettlementAllocations, buildSettlementSummary } from "./settlement.js";

interface SettlementExecutor {
  execute(raid: RaidRecord): Promise<SettlementExecutionRecord | undefined>;
}

const registryAbi = [
  {
    type: "function",
    name: "createRaid",
    stateMutability: "nonpayable",
    inputs: [{ name: "taskHash", type: "bytes32" }],
    outputs: [{ name: "raidId", type: "uint256" }],
  },
  {
    type: "function",
    name: "linkChildJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "raidId", type: "uint256" },
      { name: "jobId", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeRaid",
    stateMutability: "nonpayable",
    inputs: [
      { name: "raidId", type: "uint256" },
      { name: "evaluationHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "RaidCreated",
    inputs: [
      { name: "raidId", type: "uint256", indexed: true },
      { name: "client", type: "address", indexed: true },
      { name: "taskHash", type: "bytes32", indexed: false },
    ],
  },
] as const;

const escrowAbi = [
  {
    type: "function",
    name: "createJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiresAt", type: "uint256" },
      { name: "description", type: "string" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
  },
  {
    type: "function",
    name: "setBudget",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "expectedBudget", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "deliverableHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "complete",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reject",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "JobCreated",
    inputs: [
      { name: "jobId", type: "uint256", indexed: true },
      { name: "client", type: "address", indexed: true },
      { name: "provider", type: "address", indexed: true },
      { name: "evaluator", type: "address", indexed: false },
    ],
  },
] as const;

type SettlementPayload = {
  executedAt: string;
  taskHash: Hex;
  evaluationHash: Hex;
  allocations: ReturnType<typeof buildSettlementAllocations>;
  summary: NonNullable<ReturnType<typeof buildSettlementSummary>>;
};

type SettlementArtifact = {
  raidId: string;
  executedAt: string;
  mode: "file" | "onchain";
  lifecycleStatus: "synthetic" | "partial" | "terminal";
  registryRaidRef: string;
  taskHash: string;
  evaluationHash: string;
  successfulProviderIds: string[];
  synthesizedOutput?: RaidRecord["synthesizedOutput"];
  settlement: NonNullable<SettlementPayload["summary"]>;
  allocations: SettlementPayload["allocations"];
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
    method: "finalizeRaid";
    args: [string, string];
  };
  childJobs: Array<{
    jobRef: string;
    providerId: string;
    providerAddress?: string | null;
    role: string;
    status: string;
    requestedAction: "complete" | "reject";
    lifecycleStatus: "synthetic" | "open" | "funded" | "submitted" | "completed" | "rejected" | "expired";
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

type WalletActor = {
  account: ReturnType<typeof privateKeyToAccount>;
  client: ReturnType<typeof createWalletClient>;
  address: Address;
};

class NoopSettlementExecutor implements SettlementExecutor {
  async execute(): Promise<SettlementExecutionRecord | undefined> {
    return undefined;
  }
}

function createExecutionPayload(raid: RaidRecord): SettlementPayload | undefined {
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
      }),
    ),
  );

  return {
    executedAt,
    taskHash,
    evaluationHash,
    allocations,
    summary,
  };
}

function toBytes32(value: string): Hex {
  const normalized = value.startsWith("0x") ? value.slice(2) : value;
  return `0x${normalized}` as Hex;
}

function normalizePrivateKey(value: string): Hex {
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function parseAtomicMultiplier(value: string | undefined): bigint {
  if (!value) {
    return 1_000_000n;
  }

  return BigInt(value);
}

function createWalletActor(config: { privateKey: Hex; chain?: ReturnType<typeof defineChain>; rpcUrl: string }): WalletActor {
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
    Object.entries(parsed).map(([providerId, privateKey]) => [providerId, normalizePrivateKey(privateKey)]),
  );
}

function isTerminalChildJobStatus(
  status: SettlementArtifact["childJobs"][number]["lifecycleStatus"],
): boolean {
  return status === "completed" || status === "rejected" || status === "expired";
}

function toAtomicAmount(amount: number, multiplier: bigint): bigint {
  const micros = BigInt(Math.round(amount * 1_000_000));
  return (micros * multiplier) / 1_000_000n;
}

function buildArtifactPath(outputDir: string, raidId: string): string {
  return resolve(outputDir, `${raidId}.settlement.json`);
}

async function writeArtifactFile(artifactPath: string, artifact: SettlementArtifact): Promise<void> {
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2), "utf8");
}

function buildFileArtifact(
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
): SettlementArtifact {
  return {
    raidId: raid.id,
    executedAt: payload.executedAt,
    mode: "file",
    lifecycleStatus: "synthetic",
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
      method: "finalizeRaid",
      args: [raid.id, payload.evaluationHash],
    },
    childJobs: payload.allocations.map((allocation, index) => ({
      jobRef: `${raid.id}:${allocation.providerId}`,
      providerId: allocation.providerId,
      role: allocation.role,
      status: allocation.status,
      requestedAction: allocation.status,
      lifecycleStatus: "synthetic",
      budgetUsd: allocation.totalAmount,
      submitResultHash: allocation.deliverableHash ?? null,
      completionPolicy:
        allocation.status === "complete"
          ? "complete child job and release payout"
          : "reject child job and refund allocation",
      nextAction: "Switch to onchain settlement mode to create ERC-8183 child jobs.",
      syntheticJobId: `${raid.id}-job-${index + 1}`,
    })),
    warnings: ["Settlement proof is synthetic in file mode."],
  };
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
    },
  ) {}

  async execute(raid: RaidRecord): Promise<SettlementExecutionRecord | undefined> {
    const payload = createExecutionPayload(raid);
    if (!payload) {
      return undefined;
    }
    const artifactPath = buildArtifactPath(this.outputDir, raid.id);
    const artifact = buildFileArtifact(raid, payload, artifactPath, this.config);
    await writeArtifactFile(artifactPath, artifact);

    return {
      mode: "file",
      proofStandard: "erc8183_aligned",
      lifecycleStatus: artifact.lifecycleStatus,
      executedAt: payload.executedAt,
      artifactPath,
      registryRaidRef: artifact.registryRaidRef,
      taskHash: payload.taskHash,
      evaluationHash: payload.evaluationHash,
      successfulProviderIds: getSuccessfulProviderIds(payload.allocations),
      allocations: payload.allocations,
      contracts: artifact.contracts,
      registryCall: artifact.registryCall,
      childJobs: artifact.childJobs,
      warnings: artifact.warnings,
    };
  }
}

class OnchainSettlementExecutor implements SettlementExecutor {
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
    },
  ) {
    this.chain = config.chainId
      ? defineChain({
          id: Number(config.chainId),
          name: "bossraid",
          nativeCurrency: {
            name: "Ether",
            symbol: "ETH",
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
    this.jobExpirySec = Number(config.jobExpirySec ?? "86400");
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

  async execute(raid: RaidRecord): Promise<SettlementExecutionRecord | undefined> {
    const payload = createExecutionPayload(raid);
    if (!payload) {
      return undefined;
    }

    const transactionHashes: string[] = [];
    const childJobs: SettlementArtifact["childJobs"] = [];
    const warnings: string[] = [];

    const createRaidHash = await this.clientActor.client.writeContract({
      chain: this.chain,
      address: this.config.registryAddress,
      abi: registryAbi,
      functionName: "createRaid",
      args: [payload.taskHash],
      account: this.clientActor.account,
    });
    transactionHashes.push(createRaidHash);

    const createRaidReceipt = await this.waitForReceipt(createRaidHash);
    const raidId = extractUintEventArg(
      parseEventLogs({
        abi: registryAbi,
        logs: createRaidReceipt.logs,
        eventName: "RaidCreated",
      }),
      "raidId",
      "RaidCreated",
    );

    const jobIds: string[] = [];
    for (const allocation of payload.allocations) {
      const providerActor = this.providerActors[allocation.providerId];
      const providerAddress = providerActor?.address ?? this.providerAddressMap[allocation.providerId] ?? zeroAddress;
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + this.jobExpirySec);
      const budgetAtomic = toAtomicAmount(allocation.totalAmount, this.atomicMultiplier);

      const createJobHash = await this.clientActor.client.writeContract({
        chain: this.chain,
        address: this.config.escrowAddress,
        abi: escrowAbi,
        functionName: "createJob",
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
          eventName: "JobCreated",
        }),
        "jobId",
        "JobCreated",
      );

      jobIds.push(jobId.toString());

      let budgetTxHash: Hash | undefined;
      let fundTxHash: Hash | undefined;
      let submitTxHash: Hash | undefined;
      let completeTxHash: Hash | undefined;
      let rejectTxHash: Hash | undefined;

      const childJob: SettlementArtifact["childJobs"][number] = {
        jobRef: `${raid.id}:${allocation.providerId}`,
        providerId: allocation.providerId,
        providerAddress,
        role: allocation.role,
        status: allocation.status,
        requestedAction: allocation.status,
        lifecycleStatus: "open",
        budgetUsd: allocation.totalAmount,
        budgetAtomic: budgetAtomic.toString(),
        submitResultHash: allocation.deliverableHash ?? null,
        completionPolicy:
          allocation.status === "complete"
            ? "submit deliverable and complete child job"
            : "reject child job from the open state",
        nextAction: null,
        jobId: jobId.toString(),
        createTxHash: createJobHash,
      };

      if (allocation.status === "complete" && budgetAtomic > 0n) {
        budgetTxHash = await this.clientActor.client.writeContract({
          chain: this.chain,
          address: this.config.escrowAddress,
          abi: escrowAbi,
          functionName: "setBudget",
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
            functionName: "fund",
            args: [jobId, budgetAtomic],
            account: this.clientActor.account,
          });
          transactionHashes.push(fundTxHash);
          await this.waitForReceipt(fundTxHash);
          childJob.fundTxHash = fundTxHash;
          childJob.lifecycleStatus = "funded";
        }
      }

      const linkTxHash = await this.clientActor.client.writeContract({
        chain: this.chain,
        address: this.config.registryAddress,
        abi: registryAbi,
        functionName: "linkChildJob",
        args: [raidId, jobId],
        account: this.clientActor.account,
      });
      transactionHashes.push(linkTxHash);
      await this.waitForReceipt(linkTxHash);
      childJob.linkTxHash = linkTxHash;

      if (allocation.status === "reject") {
        rejectTxHash = await this.clientActor.client.writeContract({
          chain: this.chain,
          address: this.config.escrowAddress,
          abi: escrowAbi,
          functionName: "reject",
          args: [jobId, payload.evaluationHash],
          account: this.clientActor.account,
        });
        transactionHashes.push(rejectTxHash);
        await this.waitForReceipt(rejectTxHash);
        childJob.rejectTxHash = rejectTxHash;
        childJob.lifecycleStatus = "rejected";
        childJobs.push(childJob);
        continue;
      }

      if (budgetAtomic <= 0n) {
        childJob.nextAction = "Successful child job has zero budget and cannot be funded.";
        warnings.push(`${allocation.providerId}: successful child job has zero budget.`);
        childJobs.push(childJob);
        continue;
      }

      if (!this.fundJobs) {
        childJob.nextAction = "Enable BOSSRAID_SETTLEMENT_FUND_JOBS to escrow successful child jobs.";
        warnings.push(`${allocation.providerId}: successful child job was left open because funding is disabled.`);
        childJobs.push(childJob);
        continue;
      }

      if (providerAddress === zeroAddress) {
        childJob.nextAction = "Configure a provider onchain address or private key before funding successful child jobs.";
        warnings.push(`${allocation.providerId}: successful child job is missing a provider address.`);
        childJobs.push(childJob);
        continue;
      }

      if (!fundTxHash) {
        childJob.nextAction = "Client funding failed before the provider could submit.";
        warnings.push(`${allocation.providerId}: successful child job did not reach Funded state.`);
        childJobs.push(childJob);
        continue;
      }

      if (!providerActor) {
        childJob.nextAction = "Provider submit is still required from the provider wallet.";
        warnings.push(`${allocation.providerId}: successful child job is funded but still awaiting provider submit.`);
        childJobs.push(childJob);
        continue;
      }

      submitTxHash = await providerActor.client.writeContract({
        chain: this.chain,
        address: this.config.escrowAddress,
        abi: escrowAbi,
        functionName: "submit",
        args: [jobId, allocation.deliverableHash ? toBytes32(allocation.deliverableHash) : payload.evaluationHash],
        account: providerActor.account,
      });
      transactionHashes.push(submitTxHash);
      await this.waitForReceipt(submitTxHash);
      childJob.submitTxHash = submitTxHash;
      childJob.lifecycleStatus = "submitted";

      if (!this.evaluatorActor) {
        childJob.nextAction = "Evaluator completion is still required from the configured evaluator wallet.";
        warnings.push(`${allocation.providerId}: successful child job is submitted but still awaiting evaluator completion.`);
        childJobs.push(childJob);
        continue;
      }

      completeTxHash = await this.evaluatorActor.client.writeContract({
        chain: this.chain,
        address: this.config.escrowAddress,
        abi: escrowAbi,
        functionName: "complete",
        args: [jobId, payload.evaluationHash],
        account: this.evaluatorActor.account,
      });
      transactionHashes.push(completeTxHash);
      await this.waitForReceipt(completeTxHash);
      childJob.completeTxHash = completeTxHash;
      childJob.lifecycleStatus = "completed";
      childJobs.push(childJob);
    }

    const allChildJobsTerminal = childJobs.every((childJob) => isTerminalChildJobStatus(childJob.lifecycleStatus));
    let finalizeTxHash: Hash | undefined;

    if (allChildJobsTerminal || !this.requireTerminalJobs) {
      finalizeTxHash = await this.clientActor.client.writeContract({
        chain: this.chain,
        address: this.config.registryAddress,
        abi: registryAbi,
        functionName: "finalizeRaid",
        args: [raidId, payload.evaluationHash],
        account: this.clientActor.account,
      });
      transactionHashes.push(finalizeTxHash);
      await this.waitForReceipt(finalizeTxHash);
    } else {
      warnings.push("Parent raid was not finalized because at least one child job is not terminal.");
    }

    const artifactPath = buildArtifactPath(this.outputDir, raid.id);
    const artifact: SettlementArtifact = {
      raidId: raid.id,
      executedAt: payload.executedAt,
      mode: "onchain",
      lifecycleStatus: allChildJobsTerminal && finalizeTxHash ? "terminal" : "partial",
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
        method: "finalizeRaid",
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
      mode: "onchain",
      proofStandard: "erc8183_aligned",
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
    if (receipt.status !== "success") {
      throw new Error(`Settlement transaction failed: ${hash}`);
    }

    return receipt;
  }
}

function extractUintEventArg(
  events: Array<{ args?: Record<string, unknown> }>,
  field: string,
  eventName: string,
): bigint {
  const value = events[0]?.args?.[field];
  if (typeof value !== "bigint") {
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
    Object.entries(parsed).map(([providerId, address]) => [providerId, getAddress(address)]),
  );
}

function parseProviderActors(
  value: string | undefined,
  options: {
    chain?: ReturnType<typeof defineChain>;
    rpcUrl: string;
    providerAddressMap: Record<string, Address>;
  },
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
          `Provider signing key for ${providerId} does not match BOSSRAID_PROVIDER_ADDRESS_MAP_JSON (${mappedAddress} != ${actor.address}).`,
        );
      }
      return [providerId, actor];
    }),
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
  },
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
      `BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY does not match BOSSRAID_EVALUATOR_ADDRESS (${actor.address} != ${config.evaluatorAddress}).`,
    );
  }
  return actor;
}

function getSuccessfulProviderIds(
  allocations: ReturnType<typeof buildSettlementAllocations>,
): string[] {
  return allocations.filter((allocation) => allocation.status === "complete").map((allocation) => allocation.providerId);
}

export function createSettlementExecutor(
  env: NodeJS.ProcessEnv,
  workspaceRoot: string,
): SettlementExecutor {
  const mode = env.BOSSRAID_SETTLEMENT_MODE ?? "file";
  if (mode === "off") {
    return new NoopSettlementExecutor();
  }

  const outputDir = resolveSettlementOutputDir(workspaceRoot, env.BOSSRAID_SETTLEMENT_DIR);
  if (mode === "onchain") {
    return new OnchainSettlementExecutor(outputDir, {
      rpcUrl: requireEnv(env.BOSSRAID_RPC_URL, "BOSSRAID_RPC_URL"),
      registryAddress: getAddress(requireEnv(env.BOSSRAID_REGISTRY_ADDRESS, "BOSSRAID_REGISTRY_ADDRESS")),
      escrowAddress: getAddress(requireEnv(env.BOSSRAID_ESCROW_ADDRESS, "BOSSRAID_ESCROW_ADDRESS")),
      tokenAddress: env.BOSSRAID_TOKEN_ADDRESS,
      evaluatorAddress: getAddress(requireEnv(env.BOSSRAID_EVALUATOR_ADDRESS, "BOSSRAID_EVALUATOR_ADDRESS")),
      privateKey: normalizePrivateKey(
        requireEnv(env.BOSSRAID_CLIENT_PRIVATE_KEY, "BOSSRAID_CLIENT_PRIVATE_KEY"),
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

function resolveSettlementOutputDir(workspaceRoot: string, configuredDir: string | undefined): string {
  if (configuredDir && configuredDir.trim().length > 0) {
    return isAbsolute(configuredDir) ? configuredDir : resolve(workspaceRoot, configuredDir);
  }

  return resolve(tmpdir(), "bossraid", "settlements");
}

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}
