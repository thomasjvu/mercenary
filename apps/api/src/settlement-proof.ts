import { readFile, writeFile } from "node:fs/promises";
import type { SettlementExecutionRecord } from "@bossraid/shared-types";
import {
  createPublicClient,
  getAddress,
  http,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";

const ZERO_BYTES32 = `0x${"0".repeat(64)}` as Hex;

const registryReadAbi = [
  {
    type: "function",
    name: "raids",
    stateMutability: "view",
    inputs: [{ name: "raidId", type: "uint256" }],
    outputs: [
      { name: "client", type: "address" },
      { name: "createdAt", type: "uint256" },
      { name: "taskHash", type: "bytes32" },
      { name: "evaluationHash", type: "bytes32" },
      { name: "finalized", type: "bool" },
    ],
  },
] as const;

const escrowReadAbi = [
  {
    type: "function",
    name: "jobs",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [
      { name: "client", type: "address" },
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "budget", type: "uint256" },
      { name: "expiresAt", type: "uint256" },
      { name: "deliverableHash", type: "bytes32" },
      { name: "status", type: "uint8" },
      { name: "description", type: "string" },
    ],
  },
] as const;

type SettlementChildJob = SettlementExecutionRecord["childJobs"][number];
type SettlementProofReadClient = {
  readContract(input: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args: readonly bigint[];
  }): Promise<unknown>;
};

type RegistryState = {
  evaluationHash: Hex;
  finalized: boolean;
};

type JobState = {
  provider: Address;
  budget: bigint;
  deliverableHash: Hex;
  status: number;
};

export function createSettlementProofRefresher(env: NodeJS.ProcessEnv): {
  refresh(record: SettlementExecutionRecord | undefined): Promise<SettlementExecutionRecord | undefined>;
} {
  const fallbackRpcUrl = env.BOSSRAID_RPC_URL?.trim();

  return {
    async refresh(record) {
      return refreshSettlementExecution(record, { fallbackRpcUrl });
    },
  };
}

export function settlementExecutionChanged(
  current: SettlementExecutionRecord | undefined,
  next: SettlementExecutionRecord | undefined,
): boolean {
  if (current === next) {
    return false;
  }

  return JSON.stringify(current ?? null) !== JSON.stringify(next ?? null);
}

export async function persistSettlementExecutionArtifact(record: SettlementExecutionRecord): Promise<void> {
  if (!record.artifactPath) {
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(await readFile(record.artifactPath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }

  const next = {
    ...parsed,
    mode: record.mode,
    lifecycleStatus: record.lifecycleStatus,
    executedAt: record.executedAt,
    registryRaidRef: record.registryRaidRef,
    taskHash: record.taskHash,
    evaluationHash: record.evaluationHash,
    successfulProviderIds: record.successfulProviderIds,
    allocations: record.allocations,
    contracts: record.contracts,
    registryCall: record.registryCall,
    childJobs: record.childJobs,
    finalizeTxHash: record.finalizeTxHash,
    transactionHashes: record.transactionHashes,
    jobIds: record.jobIds,
    warnings: record.warnings,
  };

  if (JSON.stringify(parsed) === JSON.stringify(next)) {
    return;
  }

  await writeFile(record.artifactPath, JSON.stringify(next, null, 2), "utf8");
}

export async function refreshSettlementExecution(
  record: SettlementExecutionRecord | undefined,
  options: {
    fallbackRpcUrl?: string;
  } = {},
): Promise<SettlementExecutionRecord | undefined> {
  if (!record || record.mode !== "onchain" || record.lifecycleStatus === "terminal") {
    return record;
  }

  const registryAddress = normalizeAddress(record.contracts.registryAddress);
  const escrowAddress = normalizeAddress(record.contracts.escrowAddress);
  const rpcUrl = record.contracts.rpcUrl ?? options.fallbackRpcUrl;
  if (!registryAddress || !escrowAddress || !rpcUrl) {
    return record;
  }

  const client = createPublicClient({
    transport: http(rpcUrl),
  });

  return refreshSettlementExecutionWithClient(record, {
    client,
    registryAddress,
    escrowAddress,
  });
}

export async function refreshSettlementExecutionWithClient(
  record: SettlementExecutionRecord,
  options: {
    client: SettlementProofReadClient;
    registryAddress?: Address;
    escrowAddress?: Address;
  },
): Promise<SettlementExecutionRecord> {
  if (record.mode !== "onchain" || record.lifecycleStatus === "terminal") {
    return record;
  }

  const registryAddress = options.registryAddress ?? normalizeAddress(record.contracts.registryAddress);
  const escrowAddress = options.escrowAddress ?? normalizeAddress(record.contracts.escrowAddress);
  const raidId = parseUint256(record.registryRaidRef);
  if (!registryAddress || !escrowAddress || raidId == null) {
    return record;
  }

  const warnings = new Set<string>();
  const refreshedChildJobs = await Promise.all(
    record.childJobs.map(async (childJob) => {
      const jobId = parseUint256(childJob.jobId);
      if (jobId == null) {
        warnings.add(`${childJob.providerId}: child job is missing a numeric onchain jobId.`);
        return childJob;
      }

      try {
        const rawJob = await options.client.readContract({
          address: escrowAddress,
          abi: escrowReadAbi,
          functionName: "jobs",
          args: [jobId],
        });
        const jobState = normalizeJobState(rawJob);
        const lifecycleStatus = mapJobLifecycleStatus(jobState.status);
        const nextAction = buildNextAction(childJob.requestedAction, lifecycleStatus, jobState.budget);

        if (nextAction) {
          warnings.add(`${childJob.providerId}: ${nextAction}`);
        }

        return {
          ...childJob,
          providerAddress: jobState.provider,
          budgetAtomic: jobState.budget.toString(),
          submitResultHash: jobState.deliverableHash === ZERO_BYTES32 ? null : jobState.deliverableHash,
          lifecycleStatus,
          nextAction,
        };
      } catch (error) {
        warnings.add(
          `${childJob.providerId}: failed to refresh onchain child job ${childJob.jobId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return childJob;
      }
    }),
  );

  let raidState: RegistryState | undefined;
  try {
    const rawRaid = await options.client.readContract({
      address: registryAddress,
      abi: registryReadAbi,
      functionName: "raids",
      args: [raidId],
    });
    raidState = normalizeRaidState(rawRaid);
  } catch (error) {
    warnings.add(`failed to refresh onchain raid ${record.registryRaidRef}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const allChildJobsTerminal =
    refreshedChildJobs.length > 0 && refreshedChildJobs.every((childJob) => isTerminalChildJobStatus(childJob.lifecycleStatus));
  const raidFinalized = raidState?.finalized === true;

  if (raidFinalized) {
    if (!record.finalizeTxHash) {
      warnings.add("Raid is finalized onchain but finalizeTxHash was not recorded in the settlement proof.");
    }
    if (raidState?.evaluationHash && raidState.evaluationHash !== ZERO_BYTES32 && raidState.evaluationHash !== record.evaluationHash) {
      warnings.add("Onchain raid evaluation hash does not match the recorded settlement proof.");
    }
  } else if (allChildJobsTerminal) {
    warnings.add("Parent raid has terminal child jobs but is not finalized onchain.");
  } else {
    warnings.add("Parent raid is not finalized onchain.");
  }

  return {
    ...record,
    lifecycleStatus: raidFinalized && allChildJobsTerminal ? "terminal" : "partial",
    childJobs: refreshedChildJobs,
    warnings: warnings.size > 0 ? [...warnings] : undefined,
  };
}

function normalizeAddress(value: string | null | undefined): Address | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return getAddress(value);
  } catch {
    return undefined;
  }
}

function parseUint256(value: string | undefined): bigint | undefined {
  if (!value) {
    return undefined;
  }

  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function isTerminalChildJobStatus(status: SettlementChildJob["lifecycleStatus"]): boolean {
  return status === "completed" || status === "rejected" || status === "expired";
}

function mapJobLifecycleStatus(status: number): SettlementChildJob["lifecycleStatus"] {
  switch (status) {
    case 0:
      return "open";
    case 1:
      return "funded";
    case 2:
      return "submitted";
    case 3:
      return "completed";
    case 4:
      return "rejected";
    case 5:
      return "expired";
    default:
      return "open";
  }
}

function buildNextAction(
  requestedAction: SettlementChildJob["requestedAction"],
  lifecycleStatus: SettlementChildJob["lifecycleStatus"],
  budgetAtomic: bigint,
): string | null {
  if (lifecycleStatus === "completed" || lifecycleStatus === "rejected" || lifecycleStatus === "expired") {
    return null;
  }

  if (requestedAction === "reject") {
    return "Reject child job is still required from the client or evaluator wallet.";
  }

  if (budgetAtomic <= 0n) {
    return "Successful child job has zero onchain budget and cannot progress.";
  }

  switch (lifecycleStatus) {
    case "open":
      return "Client funding is still required before provider submit.";
    case "funded":
      return "Provider submit is still required from the provider wallet.";
    case "submitted":
      return "Evaluator completion is still required from the configured evaluator wallet.";
    default:
      return null;
  }
}

function normalizeRaidState(value: unknown): RegistryState {
  if (Array.isArray(value)) {
    return {
      evaluationHash: value[3] as Hex,
      finalized: value[4] === true,
    };
  }

  const input = value as {
    evaluationHash?: Hex;
    finalized?: boolean;
  };
  return {
    evaluationHash: input.evaluationHash ?? ZERO_BYTES32,
    finalized: input.finalized === true,
  };
}

function normalizeJobState(value: unknown): JobState {
  if (Array.isArray(value)) {
    return {
      provider: value[1] as Address,
      budget: value[3] as bigint,
      deliverableHash: value[5] as Hex,
      status: Number(value[6]),
    };
  }

  const input = value as {
    provider?: Address;
    budget?: bigint;
    deliverableHash?: Hex;
    status?: number | bigint;
  };
  return {
    provider: input.provider as Address,
    budget: (input.budget ?? 0n) as bigint,
    deliverableHash: (input.deliverableHash ?? ZERO_BYTES32) as Hex,
    status: Number(input.status ?? 0),
  };
}
