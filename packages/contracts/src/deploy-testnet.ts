import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getAddress,
  http,
  parseAbi,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { deployContracts } from './deploy.js';

const TESTNET_RPC_DEFAULT = 'https://rpc.testnet.chain.robinhood.com';
const TESTNET_CHAIN_ID = 46630;
const DEFAULT_MINT = 1_000_000n * 1_000_000n; // 1_000_000 tUSDG (6 decimals)

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function normalizePrivateKey(value: string): Hex {
  return (value.startsWith('0x') ? value : `0x${value}`) as Hex;
}

async function compileTestUsdg(packageRoot: string): Promise<{ abi: unknown[]; bytecode: Hex }> {
  const source = await readFile(resolve(packageRoot, 'src/TestUSDG.sol'), 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'TestUSDG.sol': { content: source } },
    settings: {
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input))) as {
    contracts?: Record<
      string,
      Record<string, { abi: unknown[]; evm: { bytecode: { object: string } } }>
    >;
    errors?: Array<{ severity: string; formattedMessage: string }>;
  };
  const errors = output.errors?.filter((item) => item.severity === 'error') ?? [];
  if (errors.length > 0) {
    throw new Error(errors.map((item) => item.formattedMessage).join('\n'));
  }
  const compiled = output.contracts?.['TestUSDG.sol']?.TestUSDG;
  if (!compiled?.evm.bytecode.object) {
    throw new Error('Missing compiled TestUSDG artifact.');
  }
  return {
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}` as Hex,
  };
}

export async function deployRobinhoodTestnet(options: {
  rpcUrl?: string;
  privateKey: string;
  mintAmount?: bigint;
  outPath: string;
  operatorAddress?: string;
  clientPrivateKey?: string;
}): Promise<{
  tokenAddress: string;
  tokenDeployTx: Hex;
  mintTx: Hex;
  deployment: Awaited<ReturnType<typeof deployContracts>>['deployment'];
  manifestPath: string;
  settlementEnv: string[];
}> {
  const packageRoot = resolve(import.meta.dirname, '..');
  const rpcUrl = options.rpcUrl ?? TESTNET_RPC_DEFAULT;
  const chainId = TESTNET_CHAIN_ID;
  const account = privateKeyToAccount(normalizePrivateKey(options.privateKey));
  const chain = defineChain({
    id: chainId,
    name: 'Robinhood Chain Testnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain, transport: http(rpcUrl) });

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) {
    throw new Error(
      `Deployer ${account.address} has zero testnet ETH. Fund via https://faucet.testnet.chain.robinhood.com/`
    );
  }

  const token = await compileTestUsdg(packageRoot);
  const tokenDeployHash = await walletClient.deployContract({
    abi: token.abi,
    bytecode: token.bytecode,
    account,
  });
  const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenDeployHash });
  if (tokenReceipt.status !== 'success' || !tokenReceipt.contractAddress) {
    throw new Error('TestUSDG deployment failed.');
  }
  const tokenAddress = getAddress(tokenReceipt.contractAddress);

  const mintAmount = options.mintAmount ?? DEFAULT_MINT;
  const mintAbi = parseAbi(['function mint(address to, uint256 amount)']);
  const mintHash = await walletClient.writeContract({
    address: tokenAddress,
    abi: mintAbi,
    functionName: 'mint',
    args: [account.address, mintAmount],
    account,
    chain,
  });
  const mintReceipt = await publicClient.waitForTransactionReceipt({ hash: mintHash });
  if (mintReceipt.status !== 'success') {
    throw new Error('TestUSDG mint failed.');
  }

  const result = await deployContracts({
    rpcUrl,
    privateKey: options.privateKey,
    tokenAddress,
    chainId,
    outPath: options.outPath,
    operatorAddress: options.operatorAddress,
    clientPrivateKey: options.clientPrivateKey ?? options.privateKey,
  });

  const bundle = {
    network: 'robinhood-testnet',
    chainId,
    rpcUrl,
    token: {
      name: 'TestUSDG',
      address: tokenAddress,
      deployTx: tokenDeployHash,
      mintTx: mintHash,
      mintAmount: mintAmount.toString(),
      decimals: 6,
    },
    deployment: result.deployment,
    manifestPath: result.manifestPath,
    settlementEnv: result.settlementEnv,
    warning:
      'TESTNET ONLY. Do not copy these addresses into production. Mainnet uses real USDG 0x5fc5…',
  };

  await mkdir(dirname(options.outPath), { recursive: true });
  await writeFile(options.outPath, JSON.stringify(bundle, null, 2), 'utf8');

  return {
    tokenAddress,
    tokenDeployTx: tokenDeployHash,
    mintTx: mintHash,
    deployment: result.deployment,
    manifestPath: result.manifestPath,
    settlementEnv: result.settlementEnv,
  };
}

async function main(): Promise<void> {
  const workspaceRoot = resolve(import.meta.dirname, '..', '..', '..');
  const privateKey = requireEnv(
    process.env.BOSSRAID_DEPLOYER_PRIVATE_KEY ?? process.env.BOSSRAID_CLIENT_PRIVATE_KEY,
    'BOSSRAID_DEPLOYER_PRIVATE_KEY (or BOSSRAID_CLIENT_PRIVATE_KEY)'
  );
  const outPath = resolve(
    workspaceRoot,
    process.env.BOSSRAID_CONTRACTS_OUT ?? 'temp/contracts/deployment.testnet.json'
  );

  const result = await deployRobinhoodTestnet({
    rpcUrl: process.env.BOSSRAID_RPC_URL ?? TESTNET_RPC_DEFAULT,
    privateKey,
    outPath,
    operatorAddress: process.env.BOSSRAID_BOUNTY_OPERATOR_ADDRESS,
    clientPrivateKey: process.env.BOSSRAID_CLIENT_PRIVATE_KEY,
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        tokenAddress: result.tokenAddress,
        tokenDeployTx: result.tokenDeployTx,
        mintTx: result.mintTx,
        deployment: result.deployment,
        manifestPath: result.manifestPath,
        settlementEnv: result.settlementEnv,
      },
      null,
      2
    )}\n`
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
