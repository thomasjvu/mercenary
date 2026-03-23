import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type { BossRaidDeployment } from "./index.js";

type CompiledContract = {
  abi: unknown[];
  bytecode: Hex;
};

type ContractsOutput = {
  raidRegistry: CompiledContract;
  bossJobEscrow: CompiledContract;
};

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }

  return value;
}

function normalizePrivateKey(value: string): Hex {
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

async function compileContracts(projectRoot: string): Promise<ContractsOutput> {
  const [raidRegistrySource, bossJobEscrowSource] = await Promise.all([
    readFile(resolve(projectRoot, "src/RaidRegistry.sol"), "utf8"),
    readFile(resolve(projectRoot, "src/BossJobEscrow.sol"), "utf8"),
  ]);

  const input = {
    language: "Solidity",
    sources: {
      "RaidRegistry.sol": { content: raidRegistrySource },
      "BossJobEscrow.sol": { content: bossJobEscrowSource },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    contracts?: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>>;
    errors?: Array<{ severity: string; formattedMessage: string }>;
  };

  const errors = output.errors?.filter((item) => item.severity === "error") ?? [];
  if (errors.length > 0) {
    throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
  }

  return {
    raidRegistry: extractCompiledContract(output, "RaidRegistry.sol", "RaidRegistry"),
    bossJobEscrow: extractCompiledContract(output, "BossJobEscrow.sol", "BossJobEscrow"),
  };
}

export type DeployContractsOptions = {
  rpcUrl: string;
  privateKey: string;
  tokenAddress: string;
  chainId?: number;
  outPath: string;
};

export async function deployContracts(options: DeployContractsOptions): Promise<{
  deployment: BossRaidDeployment;
  manifestPath: string;
  settlementEnv: string[];
}> {
  const packageRoot = resolve(import.meta.dirname, "..");
  const compiled = await compileContracts(packageRoot);
  const account = privateKeyToAccount(normalizePrivateKey(options.privateKey));
  const chain = options.chainId
    ? defineChain({
        id: options.chainId,
        name: "bossraid",
        nativeCurrency: {
          name: "Ether",
          symbol: "ETH",
          decimals: 18,
        },
        rpcUrls: {
          default: {
            http: [options.rpcUrl],
          },
        },
      })
    : undefined;

  const publicClient = createPublicClient({
    chain,
    transport: http(options.rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(options.rpcUrl),
  });

  const registryDeployHash = await walletClient.deployContract({
    abi: compiled.raidRegistry.abi,
    bytecode: compiled.raidRegistry.bytecode,
    account,
  });
  const registryReceipt = await publicClient.waitForTransactionReceipt({ hash: registryDeployHash });
  if (registryReceipt.status !== "success" || !registryReceipt.contractAddress) {
    throw new Error("RaidRegistry deployment failed.");
  }

  const tokenAddress = getAddress(options.tokenAddress);
  const escrowDeployHash = await walletClient.deployContract({
    abi: compiled.bossJobEscrow.abi,
    bytecode: compiled.bossJobEscrow.bytecode,
    args: [tokenAddress],
    account,
  });
  const escrowReceipt = await publicClient.waitForTransactionReceipt({ hash: escrowDeployHash });
  if (escrowReceipt.status !== "success" || !escrowReceipt.contractAddress) {
    throw new Error("BossJobEscrow deployment failed.");
  }

  const deployment: BossRaidDeployment = {
    chainId: options.chainId,
    rpcUrl: options.rpcUrl,
    deployerAddress: account.address,
    tokenAddress,
    registryAddress: registryReceipt.contractAddress,
    escrowAddress: escrowReceipt.contractAddress,
    transactionHashes: {
      registryDeploy: registryDeployHash,
      escrowDeploy: escrowDeployHash,
    },
    deployedAt: new Date().toISOString(),
  };

  await mkdir(dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, JSON.stringify(deployment, null, 2), "utf8");

  const settlementEnv = [
    `BOSSRAID_RPC_URL=${options.rpcUrl}`,
    options.chainId ? `BOSSRAID_CHAIN_ID=${options.chainId}` : null,
    `BOSSRAID_REGISTRY_ADDRESS=${deployment.registryAddress}`,
    `BOSSRAID_ESCROW_ADDRESS=${deployment.escrowAddress}`,
    `BOSSRAID_TOKEN_ADDRESS=${deployment.tokenAddress}`,
  ].filter((value): value is string => Boolean(value));

  return {
    deployment,
    manifestPath: options.outPath,
    settlementEnv,
  };
}

function extractCompiledContract(
  output: {
    contracts?: Record<string, Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>>;
  },
  fileName: string,
  contractName: string,
): CompiledContract {
  const compiled = output.contracts?.[fileName]?.[contractName];
  if (!compiled?.evm.bytecode.object) {
    throw new Error(`Missing compiled artifact for ${contractName}.`);
  }

  return {
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}` as Hex,
  };
}

async function main(): Promise<void> {
  const workspaceRoot = resolve(import.meta.dirname, "..", "..", "..");
  const rpcUrl = requireEnv(process.env.BOSSRAID_RPC_URL, "BOSSRAID_RPC_URL");
  const privateKey = requireEnv(process.env.BOSSRAID_DEPLOYER_PRIVATE_KEY, "BOSSRAID_DEPLOYER_PRIVATE_KEY");
  const tokenAddress = requireEnv(process.env.BOSSRAID_TOKEN_ADDRESS, "BOSSRAID_TOKEN_ADDRESS");
  const outPath = resolve(workspaceRoot, process.env.BOSSRAID_CONTRACTS_OUT ?? "temp/contracts/deployment.json");
  const chainId = process.env.BOSSRAID_CHAIN_ID ? Number(process.env.BOSSRAID_CHAIN_ID) : undefined;
  const result = await deployContracts({
    rpcUrl,
    privateKey,
    tokenAddress,
    chainId,
    outPath,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        ...result.deployment,
        manifestPath: result.manifestPath,
        settlementEnv: result.settlementEnv,
      },
      null,
      2,
    )}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
