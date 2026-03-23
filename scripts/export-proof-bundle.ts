import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { FileBossRaidPersistence, type BossRaidPersistence } from "@bossraid/persistence";
import { SqliteBossRaidPersistence } from "@bossraid/persistence-sqlite";
import { BossRaidOrchestrator } from "@bossraid/orchestrator";
import { runtimeExecutionEnabled, runtimeExecutionTransport } from "@bossraid/sandbox-runner";
import type { RaidRecord } from "@bossraid/shared-types";
import { mnemonicToAccount } from "viem/accounts";
import { buildAgentLog, buildAgentManifest } from "../apps/api/src/agent-artifacts.ts";

type CliArgs = {
  raidId?: string;
  raidAccessToken?: string;
  outDir?: string;
  sqliteFile?: string;
  stateFile?: string;
  apiBaseUrl?: string;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const persistence = createPersistence(args);
  const snapshot = await persistence.loadState();
  const orchestrator = new BossRaidOrchestrator();
  orchestrator.restoreState(snapshot);

  const raid = selectRaid(orchestrator, args.raidId);
  const outDir = resolve(args.outDir ?? `./temp/proof-bundles/${raid.id}`);
  const mercenaryIdentity = readMercenaryErc8004Identity(process.env);
  const teeWalletAddress = readTeeWalletAddress(process.env);

  const manifest = buildAgentManifest(orchestrator, {
    runtimeExecutionRequested: readBooleanEnv(process.env.BOSSRAID_EVAL_RUNTIME_EXECUTION),
    runtimeExecutionEnabled: runtimeExecutionEnabled(process.env),
    evaluatorTransport: runtimeExecutionTransport(process.env),
    workerIsolation: process.env.BOSSRAID_EVAL_JOB_ISOLATION === "container" ? "per_job_container" : "per_job_process",
    maxEvaluatorJobs: readPositiveInteger(process.env.BOSSRAID_EVAL_MAX_CONCURRENT_JOBS, 2),
    teeWalletAddress,
    mercenaryIdentity,
  });
  const agentLog = buildAgentLog(raid, {
    getRaid: (currentRaidId) => orchestrator.getRaid(currentRaidId),
    getProvider: (providerId) => orchestrator.getProviderProfile(providerId),
    raidAccessToken: args.raidAccessToken,
  });
  const result = orchestrator.getResult(raid.id);

  await mkdir(outDir, { recursive: true });
  await writeJson(resolve(outDir, "agent.json"), manifest);
  await writeJson(resolve(outDir, "agent_log.json"), agentLog);
  await writeJson(resolve(outDir, "result.json"), result);

  let settlementArtifactFile: string | null = null;
  if (raid.settlementExecution?.artifactPath) {
    const copied = await copySettlementArtifact(raid.settlementExecution.artifactPath, outDir);
    settlementArtifactFile = copied;
  }

  const publicUrls = buildPublicUrls({
    apiBaseUrl: args.apiBaseUrl,
    raidId: raid.id,
    raidAccessToken: args.raidAccessToken,
  });

  await writeJson(resolve(outDir, "proof-index.json"), {
    schemaVersion: "bossraid-proof-bundle/v1",
    generatedAt: new Date().toISOString(),
    raid: {
      raidId: raid.id,
      status: raid.status,
      parentRaidId: raid.parentRaidId ?? null,
      childRaidCount: raid.childRaidIds?.length ?? 0,
      requireErc8004: raid.task.constraints.requireErc8004 === true,
      minTrustScore: raid.task.constraints.minTrustScore ?? null,
      venicePrivateLane: raid.routingProof?.policy.venicePrivateLane ?? raid.task.constraints.privacyMode === "strict",
    },
    settlement: raid.settlementExecution
      ? {
          mode: raid.settlementExecution.mode,
          proofStandard: raid.settlementExecution.proofStandard,
          registryRaidRef: raid.settlementExecution.registryRaidRef,
          transactionCount: raid.settlementExecution.transactionHashes?.length ?? 0,
          childJobCount: raid.settlementExecution.childJobs.length,
          artifactFile: settlementArtifactFile,
        }
      : null,
    files: {
      manifest: "agent.json",
      agentLog: "agent_log.json",
      result: "result.json",
      proofIndex: "proof-index.json",
      settlementArtifact: settlementArtifactFile,
    },
    publicUrls,
  });

  printSummary({
    outDir,
    raid,
    publicUrls,
    settlementArtifactFile,
  });
}

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") {
      continue;
    }
    if (value === "--help" || value === "-h") {
      printHelp();
      process.exit(0);
    }
    if (value === "--raid-id") {
      parsed.raidId = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--raid-access-token") {
      parsed.raidAccessToken = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--out-dir") {
      parsed.outDir = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--sqlite-file") {
      parsed.sqliteFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--state-file") {
      parsed.stateFile = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--api-base-url") {
      parsed.apiBaseUrl = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }

  return parsed;
}

function printHelp(): void {
  console.log(
    [
      "Export one persisted raid into a static proof bundle.",
      "",
      "Usage:",
      "  pnpm export:proof-bundle -- [options]",
      "",
      "Options:",
      "  --raid-id <id>             Export this raid id. Defaults to the newest root raid.",
      "  --raid-access-token <tok>  Include receiptPath and public read URLs that need the token.",
      "  --out-dir <path>           Output directory. Defaults to temp/proof-bundles/<raidId>.",
      "  --sqlite-file <path>       SQLite snapshot path. Defaults to BOSSRAID_SQLITE_FILE or temp/bossraid-state.sqlite.",
      "  --state-file <path>        JSON state snapshot path when using file persistence.",
      "  --api-base-url <url>       Base URL used to emit public proof links in proof-index.json.",
    ].join("\n"),
  );
}

function createPersistence(args: CliArgs): BossRaidPersistence {
  if (args.stateFile) {
    return new FileBossRaidPersistence(resolve(args.stateFile));
  }

  const sqliteFile = resolve(args.sqliteFile ?? process.env.BOSSRAID_SQLITE_FILE ?? "./temp/bossraid-state.sqlite");
  return new SqliteBossRaidPersistence(sqliteFile);
}

function selectRaid(orchestrator: BossRaidOrchestrator, raidId?: string): RaidRecord {
  if (raidId) {
    const explicit = orchestrator.getRaid(raidId);
    if (!explicit) {
      throw new Error(`Unknown raid: ${raidId}`);
    }
    return explicit;
  }

  const latestRootRaid = orchestrator.listRaids()[0];
  if (!latestRootRaid) {
    throw new Error("No root raids exist in the loaded persistence snapshot.");
  }
  return latestRootRaid;
}

function readBooleanEnv(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function readMercenaryErc8004Identity(env: NodeJS.ProcessEnv) {
  const agentId = env.BOSSRAID_ERC8004_AGENT_ID?.trim();
  if (!agentId) {
    return undefined;
  }

  const validationTxs = env.BOSSRAID_ERC8004_VALIDATION_TXS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    agentId,
    operatorWallet: env.BOSSRAID_ERC8004_OPERATOR_WALLET?.trim() || undefined,
    registrationTx: env.BOSSRAID_ERC8004_REGISTRATION_TX?.trim() || undefined,
    identityRegistry: env.BOSSRAID_ERC8004_IDENTITY_REGISTRY?.trim() || undefined,
    reputationRegistry: env.BOSSRAID_ERC8004_REPUTATION_REGISTRY?.trim() || undefined,
    validationRegistry: env.BOSSRAID_ERC8004_VALIDATION_REGISTRY?.trim() || undefined,
    validationTxs: validationTxs && validationTxs.length > 0 ? validationTxs : undefined,
    lastVerifiedAt: env.BOSSRAID_ERC8004_LAST_VERIFIED_AT?.trim() || undefined,
  };
}

function readTeeWalletAddress(env: NodeJS.ProcessEnv): string | null {
  const mnemonic = env.MNEMONIC?.trim();
  if (!mnemonic) {
    return null;
  }

  try {
    return mnemonicToAccount(mnemonic).address;
  } catch {
    return null;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function copySettlementArtifact(sourcePath: string, outDir: string): Promise<string | null> {
  try {
    await access(sourcePath);
  } catch {
    return null;
  }

  const target = resolve(outDir, "settlement-execution.json");
  await copyFile(sourcePath, target);
  return "settlement-execution.json";
}

function buildPublicUrls(input: {
  apiBaseUrl?: string;
  raidId: string;
  raidAccessToken?: string;
}): Record<string, string> | null {
  if (!input.apiBaseUrl) {
    return null;
  }

  const base = input.apiBaseUrl.replace(/\/+$/, "");
  const urls: Record<string, string> = {
    manifest: `${base}/v1/agent.json`,
  };

  if (input.raidAccessToken) {
    const raidId = encodeURIComponent(input.raidId);
    const token = encodeURIComponent(input.raidAccessToken);
    urls.receipt = `${base}/receipt?raidId=${raidId}&token=${token}`;
    urls.agentLog = `${base}/v1/raids/${raidId}/agent_log.json?token=${token}`;
  }

  return urls;
}

function printSummary(input: {
  outDir: string;
  raid: RaidRecord;
  publicUrls: Record<string, string> | null;
  settlementArtifactFile: string | null;
}): void {
  console.log(`PROOF_BUNDLE_OUT=${input.outDir}`);
  console.log(`RAID_ID=${input.raid.id}`);
  console.log(`RAID_STATUS=${input.raid.status}`);
  console.log(`CHILD_RAID_COUNT=${input.raid.childRaidIds?.length ?? 0}`);
  console.log(`REQUIRE_ERC8004=${input.raid.task.constraints.requireErc8004 === true}`);
  console.log(`SETTLEMENT_MODE=${input.raid.settlementExecution?.mode ?? "none"}`);
  console.log(`PROOF_STANDARD=${input.raid.settlementExecution?.proofStandard ?? "none"}`);
  console.log(`SETTLEMENT_ARTIFACT=${input.settlementArtifactFile ?? "none"}`);
  if (input.publicUrls?.receipt) {
    console.log(`PUBLIC_RECEIPT=${input.publicUrls.receipt}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
