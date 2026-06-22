import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canVerifyOnchain,
  hasOnchainBootstrap,
  loadBountyE2eEnv,
  loadProviderAddressMapJson,
  resolveBountyProvider,
  resolvePosterPrivateKey,
  resolveProviderToken,
  resolveRewardUsd,
} from './lib/bounty-e2e-env.mjs';
import { runBountyEscrowE2e } from './lib/bounty-e2e-run.mjs';
import { runCommand, sleep, stopChild } from './lib/process-harness.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadBountyE2eEnv(rootDir);

const onchainBootstrap = hasOnchainBootstrap(rootDir);
const apiPort = 8800 + (Date.now() % 100);
const apiBase = `http://127.0.0.1:${apiPort}`;
const mockFacilitatorHost = process.env.BOSSRAID_MOCK_FACILITATOR_HOST ?? '127.0.0.1';
const mockFacilitatorPort = Number(process.env.BOSSRAID_MOCK_FACILITATOR_PORT ?? '8791');
const mockFacilitatorUrl = `http://${mockFacilitatorHost}:${mockFacilitatorPort}`;
const sqliteFile = `./temp/bounty-escrow-local-${Date.now()}.sqlite`;
const provider = resolveBountyProvider(rootDir);
const providerId = provider.providerId;
const providerToken = resolveProviderToken(provider);
const providerAddressMap = loadProviderAddressMapJson(rootDir);

const mode = onchainBootstrap
  ? process.env.BOSSRAID_X402_BUYER_PRIVATE_KEY?.trim() ||
    process.env.EVM_PRIVATE_KEY?.trim() ||
    process.env.BOSSRAID_CLIENT_PRIVATE_KEY?.trim()
    ? 'wallet'
    : 'mock'
  : 'unverified';

const rewardUsd = resolveRewardUsd();
const posterPrivateKey = resolvePosterPrivateKey(mode);

const env = {
  ...process.env,
  PORT: String(apiPort),
  BOSSRAID_API_BASE: apiBase,
  BOSSRAID_STORAGE_BACKEND: 'sqlite',
  BOSSRAID_SQLITE_FILE: sqliteFile,
  BOSSRAID_BOUNTY_SQLITE_FILE: sqliteFile,
  BOSSRAID_PROVIDERS_FILE: process.env.BOSSRAID_PROVIDERS_FILE ?? './examples/bounty-e2e.providers.json',
  BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH: process.env.BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH ?? '1',
  BOSSRAID_CALLBACK_BASE: apiBase,
  BOSSRAID_EVAL_SANDBOX_MODE: process.env.BOSSRAID_EVAL_SANDBOX_MODE ?? 'socket',
  BOSSRAID_EVAL_SANDBOX_TOKEN: process.env.BOSSRAID_EVAL_SANDBOX_TOKEN ?? 'local-dev-eval-token',
};

if (providerAddressMap) {
  env.BOSSRAID_PROVIDER_ADDRESS_MAP_JSON = providerAddressMap;
}

if (onchainBootstrap) {
  Object.assign(env, {
    BOSSRAID_SETTLEMENT_MODE: 'onchain',
    BOSSRAID_X402_ENABLED: 'true',
    BOSSRAID_X402_PAY_TO: process.env.BOSSRAID_X402_PAY_TO ?? '0x0000000000000000000000000000000000000001',
    BOSSRAID_X402_FACILITATOR_URL: mockFacilitatorUrl,
    BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND: 'false',
  });
} else {
  Object.assign(env, {
    BOSSRAID_SETTLEMENT_MODE: 'file',
    BOSSRAID_X402_ENABLED: 'false',
    BOSSRAID_ALLOW_UNVERIFIED_BOUNTY_FUND: 'true',
  });
}

let apiChild;
let facilitatorChild;
let teardownStarted = false;

const teardown = async () => {
  if (teardownStarted) {
    return;
  }
  teardownStarted = true;
  await Promise.all([stopChild(apiChild), stopChild(facilitatorChild)]);
};

process.on('SIGINT', () => void teardown());
process.on('SIGTERM', () => void teardown());

console.log(
  JSON.stringify(
    {
      step: 'local_harness_start',
      apiBase,
      onchainBootstrap,
      mode,
      providerId,
      rewardUsd,
    },
    null,
    2
  )
);

try {
  console.log(JSON.stringify({ step: 'build' }, null, 2));
  await runCommand(rootDir, env, 'pnpm', ['--filter', '@bossraid/api', 'build']);

  if (onchainBootstrap) {
    console.log(JSON.stringify({ step: 'start_mock_facilitator', url: mockFacilitatorUrl }, null, 2));
    facilitatorChild = spawn('node', ['scripts/mock-x402-facilitator.mjs'], {
      cwd: rootDir,
      stdio: 'inherit',
      env,
    });
    await waitForHttp(`${mockFacilitatorUrl}/verify`, 'mock facilitator', 10_000, 'POST');
  }

  console.log(JSON.stringify({ step: 'start_api', apiBase }, null, 2));
  apiChild = spawn('node', ['apps/api/dist/apps/api/src/index.js'], {
    cwd: rootDir,
    stdio: 'inherit',
    env,
  });

  await waitForHealth(apiBase);

  await runBountyEscrowE2e({
    apiBase,
    mode,
    providerId,
    providerToken,
    rewardUsd,
    posterPrivateKey,
    onchainVerify: onchainBootstrap && canVerifyOnchain(),
  });
} finally {
  await teardown();
}

async function waitForHealth(apiBase, timeoutMs = 60_000) {
  const url = `${apiBase}/health`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(url).catch(() => undefined);
    if (response?.ok) {
      const payload = await response.json();
      const bountiesProbe = await fetch(`${apiBase}/v1/bounties?limit=1`).catch(() => undefined);
      if (bountiesProbe?.ok) {
        console.log(JSON.stringify({ step: 'health_ready', payload }, null, 2));
        return payload;
      }
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for API health at ${url}`);
}

async function waitForHttp(url, label, timeoutMs, method = 'GET') {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(url, {
      method,
      headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
      body: method === 'POST' ? '{}' : undefined,
    }).catch(() => undefined);
    if (response && response.status !== 404) {
      return;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}