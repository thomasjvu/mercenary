import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  formatDotenvEntries,
  normalizeProviderSettlementIds,
  parseDotenv,
} from './lib/phala-secret-tiers.mjs';

const workspaceRoot = process.cwd();
const onchainPath = resolve(workspaceRoot, 'deploy/phala/secrets.onchain.env');
const deploymentPath = resolve(workspaceRoot, 'temp/contracts/deployment.json');
const args = new Set(process.argv.slice(2));
const skipDeploy = args.has('--skip-deploy');

function run(command, runArgs, label) {
  console.log(JSON.stringify({ step: label ?? command }, null, 2));
  const result = spawnSync(command, runArgs, {
    cwd: workspaceRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${runArgs.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`
    );
  }
  return (result.stdout ?? '').trim();
}

function mergeEnvFile(path, entries) {
  const current = existsSync(path) ? parseDotenv(readFileSync(path, 'utf8')) : {};
  const merged = normalizeProviderSettlementIds({ ...current, ...entries });
  writeFileSync(path, formatDotenvEntries(merged), 'utf8');
  return merged;
}

function readDeployment() {
  if (!existsSync(deploymentPath)) {
    return null;
  }
  return JSON.parse(readFileSync(deploymentPath, 'utf8'));
}

function main() {
  console.log(JSON.stringify({ step: 'normalize_onchain_provider_ids' }, null, 2));
  if (existsSync(onchainPath)) {
    const current = parseDotenv(readFileSync(onchainPath, 'utf8'));
    const normalized = normalizeProviderSettlementIds(current);
    writeFileSync(onchainPath, formatDotenvEntries(normalized), 'utf8');
  }

  let deployment = readDeployment();

  if (!deployment && !skipDeploy) {
    const deployerKey =
      process.env.BOSSRAID_DEPLOYER_PRIVATE_KEY ?? process.env.BOSSRAID_CLIENT_PRIVATE_KEY;
    if (!deployerKey?.trim()) {
      throw new Error(
        'Missing BOSSRAID_DEPLOYER_PRIVATE_KEY (or BOSSRAID_CLIENT_PRIVATE_KEY) for contract deployment.'
      );
    }

    const onchainSecrets = existsSync(onchainPath)
      ? parseDotenv(readFileSync(onchainPath, 'utf8'))
      : {};
    const clientKey =
      onchainSecrets.BOSSRAID_CLIENT_PRIVATE_KEY ?? process.env.BOSSRAID_CLIENT_PRIVATE_KEY;

    const deployEnv = {
      ...process.env,
      BOSSRAID_DEPLOYER_PRIVATE_KEY: deployerKey.trim(),
      BOSSRAID_CLIENT_PRIVATE_KEY: clientKey?.trim(),
      BOSSRAID_RPC_URL: process.env.BOSSRAID_RPC_URL ?? 'https://mainnet.base.org',
      BOSSRAID_CHAIN_ID: process.env.BOSSRAID_CHAIN_ID ?? '4663',
      BOSSRAID_TOKEN_ADDRESS:
        process.env.BOSSRAID_TOKEN_ADDRESS ?? '0x833589fCD6eDb6B08d2E354A1d9441D5b2AaE4a5',
    };

    console.log(JSON.stringify({ step: 'deploy_contracts', chainId: deployEnv.BOSSRAID_CHAIN_ID }, null, 2));
    run('pnpm', ['build', '--filter', '@bossraid/contracts'], 'build_contracts');
    const deployOutput = spawnSync(
      'pnpm',
      ['--filter', '@bossraid/contracts', 'exec', '--', 'node', 'dist/deploy.js'],
      {
        cwd: workspaceRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: deployEnv,
      }
    );
    if (deployOutput.status !== 0) {
      throw new Error(
        `Contract deployment failed (${deployOutput.status}): ${deployOutput.stderr || deployOutput.stdout}`
      );
    }
    deployment = readDeployment();
  }

  if (deployment) {
    console.log(JSON.stringify({ step: 'merge_contract_addresses', deploymentPath }, null, 2));
    mergeEnvFile(onchainPath, {
      BOSSRAID_REGISTRY_ADDRESS: deployment.registryAddress,
      BOSSRAID_ESCROW_ADDRESS: deployment.escrowAddress,
      BOSSRAID_BOUNTY_ESCROW_ADDRESS: deployment.bountyEscrowAddress,
      BOSSRAID_RPC_URL: deployment.rpcUrl,
      BOSSRAID_CHAIN_ID: deployment.chainId ? String(deployment.chainId) : '4663',
      BOSSRAID_TOKEN_ADDRESS: deployment.tokenAddress,
    });
  } else {
    console.log(
      JSON.stringify({
        step: 'deploy_skipped',
        message:
          'No deployment manifest found. Fund a deployer wallet and rerun without --skip-deploy, or write temp/contracts/deployment.json manually.',
      }, null, 2)
    );
  }

  run('node', ['scripts/bootstrap-phala-deploy-env.mjs'], 'bootstrap_phala_env');
  run('node', ['scripts/phala-secrets-preflight.mjs', 'deploy/phala/.env'], 'phala_preflight');

  const assembled = parseDotenv(readFileSync(resolve(workspaceRoot, 'deploy/phala/.env'), 'utf8'));
  console.log(
    JSON.stringify(
      {
        step: 'cutover_complete',
        settlementMode: assembled.BOSSRAID_SETTLEMENT_MODE,
        registryConfigured: Boolean(assembled.BOSSRAID_REGISTRY_ADDRESS),
        bountyEscrowConfigured: Boolean(assembled.BOSSRAID_BOUNTY_ESCROW_ADDRESS),
        next: [
          'pnpm infisical:phala:push',
          'phala envs update bossraid-main -e deploy/phala/.env',
          'phala deploy --cvm-id bossraid-main --compose deploy/phala/docker-compose.yml -e deploy/phala/.env --wait',
          'curl -H "Authorization: Bearer $BOSSRAID_ADMIN_TOKEN" https://bossraid-web.pages.dev/api/v1/ops/production-readiness',
        ],
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}