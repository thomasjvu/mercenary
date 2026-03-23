import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
    budgetUsd: number;
    budgetAtomic?: string;
    submitResultHash: string | null;
    completionPolicy: string;
    syntheticJobId?: string;
    jobId?: string;
    createTxHash?: string;
    linkTxHash?: string;
    budgetTxHash?: string;
    fundTxHash?: string;
  }>;
  transactionHashes?: string[];
  jobIds?: string[];
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
      budgetUsd: allocation.totalAmount,
      submitResultHash: allocation.deliverableHash ?? null,
      completionPolicy:
        allocation.status === "complete"
          ? "complete child job and release payout"
          : "reject child job and refund allocation",
      syntheticJobId: `${raid.id}-job-${index + 1}`,
    })),
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
    };
  }
}

class OnchainSettlementExecutor implements SettlementExecutor {
  private readonly publicClient;
  private readonly walletClient;
  private readonly account;
  private readonly chain;
  private readonly jobExpirySec: number;
  private readonly atomicMultiplier: bigint;
  private readonly fundJobs: boolean;
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
    },
  ) {
    this.account = privateKeyToAccount(config.privateKey);
    this.clientAddress = this.account.address;
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
    this.walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(config.rpcUrl),
    });
    this.jobExpirySec = Number(config.jobExpirySec ?? "86400");
    this.atomicMultiplier = parseAtomicMultiplier(config.atomicMultiplier);
    this.fundJobs = parseBoolean(config.fundJobs);
    this.providerAddressMap = parseProviderAddressMap(config.providerAddressMapJson);
  }

  async execute(raid: RaidRecord): Promise<SettlementExecutionRecord | undefined> {
    const payload = createExecutionPayload(raid);
    if (!payload) {
      return undefined;
    }

    const transactionHashes: string[] = [];
    const childJobs: SettlementArtifact["childJobs"] = [];

    const createRaidHash = await this.walletClient.writeContract({
      address: this.config.registryAddress,
      abi: registryAbi,
      functionName: "createRaid",
      args: [payload.taskHash],
      account: this.account,
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
      const providerAddress = this.providerAddressMap[allocation.providerId] ?? zeroAddress;
      const expiresAt = BigInt(Math.floor(Date.now() / 1000) + this.jobExpirySec);
      const budgetAtomic = toAtomicAmount(allocation.totalAmount, this.atomicMultiplier);

      const createJobHash = await this.walletClient.writeContract({
        address: this.config.escrowAddress,
        abi: escrowAbi,
        functionName: "createJob",
        args: [
          providerAddress,
          this.config.evaluatorAddress,
          expiresAt,
          `${raid.id}:${allocation.providerId}:${allocation.role}`,
        ],
        account: this.account,
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

      if (budgetAtomic > 0n) {
        budgetTxHash = await this.walletClient.writeContract({
          address: this.config.escrowAddress,
          abi: escrowAbi,
          functionName: "setBudget",
          args: [jobId, budgetAtomic],
          account: this.account,
        });
        transactionHashes.push(budgetTxHash);
        await this.waitForReceipt(budgetTxHash);

        if (this.fundJobs && providerAddress !== zeroAddress) {
          fundTxHash = await this.walletClient.writeContract({
            address: this.config.escrowAddress,
            abi: escrowAbi,
            functionName: "fund",
            args: [jobId, budgetAtomic],
            account: this.account,
          });
          transactionHashes.push(fundTxHash);
          await this.waitForReceipt(fundTxHash);
        }
      }

      const linkTxHash = await this.walletClient.writeContract({
        address: this.config.registryAddress,
        abi: registryAbi,
        functionName: "linkChildJob",
        args: [raidId, jobId],
        account: this.account,
      });
      transactionHashes.push(linkTxHash);
      await this.waitForReceipt(linkTxHash);

      childJobs.push({
        jobRef: `${raid.id}:${allocation.providerId}`,
        providerId: allocation.providerId,
        providerAddress,
        role: allocation.role,
        status: allocation.status,
        budgetUsd: allocation.totalAmount,
        budgetAtomic: budgetAtomic.toString(),
        submitResultHash: allocation.deliverableHash ?? null,
        completionPolicy:
          allocation.status === "complete"
            ? "submit and complete child job"
            : "reject child job",
        jobId: jobId.toString(),
        createTxHash: createJobHash,
        budgetTxHash,
        fundTxHash,
        linkTxHash,
      });
    }

    const finalizeHash = await this.walletClient.writeContract({
      address: this.config.registryAddress,
      abi: registryAbi,
      functionName: "finalizeRaid",
      args: [raidId, payload.evaluationHash],
      account: this.account,
    });
    transactionHashes.push(finalizeHash);
    await this.waitForReceipt(finalizeHash);

    const artifactPath = buildArtifactPath(this.outputDir, raid.id);
    const artifact: SettlementArtifact = {
      raidId: raid.id,
      executedAt: payload.executedAt,
      mode: "onchain",
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
      transactionHashes,
      jobIds,
    };
    await writeArtifactFile(artifactPath, artifact);

    return {
      mode: "onchain",
      proofStandard: "erc8183_aligned",
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
      transactionHashes,
      jobIds,
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

  const outputDir = resolve(workspaceRoot, env.BOSSRAID_SETTLEMENT_DIR ?? "temp/settlements");
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

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}
