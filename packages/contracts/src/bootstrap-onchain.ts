import { resolve } from "node:path";
import { deployContracts } from "./deploy.js";
import { writeSettlementEnv } from "./bootstrap-settlement-env.js";

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}

async function main(): Promise<void> {
  const workspaceRoot = resolve(import.meta.dirname, "..", "..", "..");
  const manifestPath = resolve(
    workspaceRoot,
    process.env.BOSSRAID_CONTRACTS_OUT ?? "temp/contracts/deployment.json",
  );
  const settlementEnvPath = resolve(
    workspaceRoot,
    process.env.BOSSRAID_SETTLEMENT_ENV_OUT ?? "temp/contracts/settlement.env",
  );

  const deployResult = await deployContracts({
    rpcUrl: requireEnv(process.env.BOSSRAID_RPC_URL, "BOSSRAID_RPC_URL"),
    privateKey: requireEnv(process.env.BOSSRAID_DEPLOYER_PRIVATE_KEY, "BOSSRAID_DEPLOYER_PRIVATE_KEY"),
    tokenAddress: requireEnv(process.env.BOSSRAID_TOKEN_ADDRESS, "BOSSRAID_TOKEN_ADDRESS"),
    chainId: process.env.BOSSRAID_CHAIN_ID ? Number(process.env.BOSSRAID_CHAIN_ID) : undefined,
    outPath: manifestPath,
  });

  const bootstrapResult = await writeSettlementEnv({
    manifestPath,
    outPath: settlementEnvPath,
    providerAddressesPath: process.env.BOSSRAID_PROVIDER_ADDRESSES_FILE
      ? resolve(workspaceRoot, process.env.BOSSRAID_PROVIDER_ADDRESSES_FILE)
      : undefined,
    evaluatorAddress: process.env.BOSSRAID_EVALUATOR_ADDRESS,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        deployment: deployResult.deployment,
        manifestPath: deployResult.manifestPath,
        settlementEnvPath: bootstrapResult.outPath,
        settlementEnvLines: bootstrapResult.linesWritten,
        next: [
          "Set BOSSRAID_CLIENT_PRIVATE_KEY in the generated settlement env file.",
          "Source the file before running on-chain settlement.",
        ],
      },
      null,
      2,
    )}\n`,
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
