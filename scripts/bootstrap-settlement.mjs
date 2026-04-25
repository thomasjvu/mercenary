import { writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(fileURLToPath(import.meta.url), "..", "..");

function run(command, args, label) {
  console.log(JSON.stringify({ step: label ?? command, args }, null, 2));
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with code ${result.status}: ${result.stdout}`);
  }
  return result.stdout.trim();
}

async function main() {
  console.log(JSON.stringify({ step: "bootstrap_start" }, null, 2));

  console.log(JSON.stringify({ step: "generate_keys" }, null, 2));
  const keysOutput = run("node", ["scripts/generate-settlement-keys.mjs"], "generate_keys");
  const keysData = JSON.parse(keysOutput);

  console.log(JSON.stringify({ step: "deploy_contracts", chain: "Base Sepolia (testnet)" }, null, 2));
  const deployOutput = run(
    "pnpm",
    ["--filter", "@bossraid/contracts", "exec", "--", "node", "src/deploy.js"],
    "deploy_contracts",
  );
  let deployment;
  try {
    deployment = JSON.parse(deployOutput);
  } catch {
    console.error("Deploy output:", deployOutput);
    deployment = JSON.parse(deployOutput.split("\n").find((l) => l.startsWith("{")));
  }

  const settlementEnv = [
    `BOSSRAID_SETTLEMENT_MODE=onchain`,
    `BOSSRAID_RPC_URL=${deployment.rpcUrl}`,
    deployment.chainId ? `BOSSRAID_CHAIN_ID=${deployment.chainId}` : null,
    `BOSSRAID_REGISTRY_ADDRESS=${deployment.registryAddress}`,
    `BOSSRAID_ESCROW_ADDRESS=${deployment.escrowAddress}`,
    `BOSSRAID_TOKEN_ADDRESS=${deployment.tokenAddress}`,
    `BOSSRAID_EVALUATOR_ADDRESS=${keysData.addresses.evaluator}`,
    `BOSSRAID_SETTLEMENT_JOB_EXPIRY_SEC=86400`,
    `BOSSRAID_SETTLEMENT_ATOMIC_MULTIPLIER=1000000`,
    `BOSSRAID_SETTLEMENT_FUND_JOBS=false`,
  ].filter(Boolean);

  const outPath = resolve(workspaceRoot, "temp/settlement-bootstrap.env");
  writeFileSync(outPath, settlementEnv.join("\n") + "\n", "utf8");

  const keysEnvPath = resolve(workspaceRoot, "temp/settlement-keys.env");

  console.log(JSON.stringify({
    step: "bootstrap_complete",
    deploymentPath: resolve(workspaceRoot, "temp/contracts/deployment.json"),
    settlementEnvPath: outPath,
    keysEnvPath,
    addresses: {
      client: keysData.addresses.client,
      evaluator: keysData.addresses.evaluator,
      gamma: keysData.addresses.gamma,
      riko: keysData.addresses.riko,
      dottie: keysData.addresses.dottie,
      registry: deployment.registryAddress,
      escrow: deployment.escrowAddress,
      token: deployment.tokenAddress,
    },
    yourTasks: [
      `Fund ${keysData.addresses.client} with USDC on ${deployment.chainId === 8453 ? "Base mainnet" : "Base Sepolia"} for escrow`,
      `Fund provider wallets with ETH for gas: ${keysData.addresses.gamma}, ${keysData.addresses.riko}, ${keysData.addresses.dottie}`,
      `Source temp/settlement-bootstrap.env + temp/settlement-keys.env before starting API`,
      `Merge both: source temp/settlement-keys.env && source temp/settlement-bootstrap.env`,
    ],
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});