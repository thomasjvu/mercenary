import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BossRaidDeployment } from "./index.js";

type CliArgs = {
  manifest?: string;
  out?: string;
  providerAddresses?: string;
  evaluatorAddress?: string;
};

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") {
      continue;
    }

    if (value === "--manifest") {
      parsed.manifest = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--out") {
      parsed.out = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--provider-addresses") {
      parsed.providerAddresses = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === "--evaluator-address") {
      parsed.evaluatorAddress = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  return parsed;
}

async function readJsonFile<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

export type BootstrapSettlementEnvOptions = {
  manifestPath: string;
  outPath: string;
  providerAddressesPath?: string;
  evaluatorAddress?: string;
};

export async function writeSettlementEnv(
  options: BootstrapSettlementEnvOptions,
): Promise<{
  manifestPath: string;
  outPath: string;
  linesWritten: number;
}> {
  const deployment = await readJsonFile<BossRaidDeployment>(options.manifestPath);
  const providerAddressMap = options.providerAddressesPath
    ? await readJsonFile<Record<string, string>>(options.providerAddressesPath)
    : undefined;
  const evaluatorAddress = options.evaluatorAddress ?? process.env.BOSSRAID_EVALUATOR_ADDRESS ?? "0xYOUR_EVALUATOR";

  const lines = [
    "BOSSRAID_SETTLEMENT_MODE=onchain",
    `BOSSRAID_RPC_URL=${deployment.rpcUrl}`,
    deployment.chainId ? `BOSSRAID_CHAIN_ID=${deployment.chainId}` : null,
    `BOSSRAID_REGISTRY_ADDRESS=${deployment.registryAddress}`,
    `BOSSRAID_ESCROW_ADDRESS=${deployment.escrowAddress}`,
    `BOSSRAID_TOKEN_ADDRESS=${deployment.tokenAddress}`,
    `BOSSRAID_EVALUATOR_ADDRESS=${evaluatorAddress}`,
    "BOSSRAID_SETTLEMENT_JOB_EXPIRY_SEC=86400",
    "BOSSRAID_SETTLEMENT_ATOMIC_MULTIPLIER=1000000",
    "BOSSRAID_SETTLEMENT_FUND_JOBS=false",
    "# BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS=true",
    providerAddressMap
      ? `BOSSRAID_PROVIDER_ADDRESS_MAP_JSON='${JSON.stringify(providerAddressMap)}'`
      : null,
    "# Set this before running on-chain settlement:",
    "# BOSSRAID_CLIENT_PRIVATE_KEY=0x...",
    "# Optional full-lifecycle automation:",
    "# BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY=0x...",
    "# BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON='{\"provider-id\":\"0x...\"}'",
  ].filter((value): value is string => Boolean(value));

  await mkdir(dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, `${lines.join("\n")}\n`, "utf8");

  return {
    manifestPath: options.manifestPath,
    outPath: options.outPath,
    linesWritten: lines.length,
  };
}

async function main(): Promise<void> {
  const packageRoot = resolve(import.meta.dirname, "..");
  const workspaceRoot = resolve(packageRoot, "..", "..");
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = resolve(
    workspaceRoot,
    args.manifest ?? process.env.BOSSRAID_CONTRACTS_OUT ?? "temp/contracts/deployment.json",
  );
  const outPath = resolve(
    workspaceRoot,
    args.out ?? process.env.BOSSRAID_SETTLEMENT_ENV_OUT ?? "temp/contracts/settlement.env",
  );
  const result = await writeSettlementEnv({
    manifestPath,
    outPath,
    providerAddressesPath: args.providerAddresses
      ? resolve(workspaceRoot, args.providerAddresses)
      : process.env.BOSSRAID_PROVIDER_ADDRESSES_FILE
        ? resolve(workspaceRoot, process.env.BOSSRAID_PROVIDER_ADDRESSES_FILE)
        : undefined,
    evaluatorAddress: args.evaluatorAddress,
  });
  process.stdout.write(
    `${JSON.stringify(result, null, 2)}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
