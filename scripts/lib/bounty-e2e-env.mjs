import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generatePrivateKey } from 'viem/accounts';
import { loadEnvFile, loadLocalEnv } from '../env.mjs';
import { loadProviderProfiles } from './provider-launcher.mjs';

const DEFAULT_PROVIDER_ID = 'bounty-e2e-provider';
const DEFAULT_PROVIDER_TOKEN = 'bossraid-bounty-e2e';
const DEFAULT_PROVIDERS_FILE = './examples/bounty-e2e.providers.json';

export { parseCliArgs, readCliArg, resolveApiBase } from './http-e2e.mjs';

export function loadBountyE2eEnv(rootDir) {
  loadLocalEnv(rootDir);
  loadEnvFile(resolve(rootDir, 'temp/settlement-keys.env'));
  loadEnvFile(resolve(rootDir, 'temp/settlement-bootstrap.env'));
}

export function resolveBountyProvider(rootDir, cliProviderId) {
  const explicit =
    cliProviderId?.trim() ||
    process.env.BOSSRAID_E2E_PROVIDER_ID?.trim() ||
    process.env.BOSSRAID_BOUNTY_E2E_PROVIDER_ID?.trim() ||
    process.env.BOSSRAID_PROVIDER_A_ID?.trim();

  const { providerProfiles } = loadProviderProfiles(rootDir, {
    ...process.env,
    BOSSRAID_PROVIDERS_FILE: process.env.BOSSRAID_PROVIDERS_FILE ?? DEFAULT_PROVIDERS_FILE,
  });

  if (explicit) {
    const provider = providerProfiles.find((entry) => entry.providerId === explicit);
    if (!provider) {
      throw new Error(
        `Provider "${explicit}" not found in configured provider files. Set BOSSRAID_PROVIDERS_FILE or BOSSRAID_BOUNTY_E2E_PROVIDER_ID.`
      );
    }
    return provider;
  }

  const preferred = providerProfiles.find((entry) => entry.providerId === DEFAULT_PROVIDER_ID);
  return preferred ?? providerProfiles[0];
}

export function resolveProviderToken(provider) {
  return (
    process.env.BOSSRAID_E2E_PROVIDER_TOKEN?.trim() ||
    process.env.BOSSRAID_BOUNTY_E2E_PROVIDER_TOKEN?.trim() ||
    provider?.auth?.token?.trim() ||
    process.env.BOSSRAID_PROVIDER_A_TOKEN?.trim() ||
    DEFAULT_PROVIDER_TOKEN
  );
}

export function resolvePosterPrivateKey(mode) {
  const candidates = [
    process.env.BOSSRAID_E2E_POSTER_PRIVATE_KEY,
    process.env.BOSSRAID_BOUNTY_E2E_POSTER_PRIVATE_KEY,
    process.env.BOSSRAID_X402_BUYER_PRIVATE_KEY,
    process.env.EVM_PRIVATE_KEY,
    process.env.BOSSRAID_CLIENT_PRIVATE_KEY,
  ];

  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  if (mode === 'unverified' || mode === 'mock') {
    return generatePrivateKey();
  }

  throw new Error(
    'BOSSRAID_E2E_POSTER_PRIVATE_KEY, BOSSRAID_X402_BUYER_PRIVATE_KEY, EVM_PRIVATE_KEY, or BOSSRAID_CLIENT_PRIVATE_KEY is required for --mode wallet.'
  );
}

export function hasOnchainBootstrap(rootDir) {
  const bootstrapPath = resolve(rootDir, 'temp/settlement-bootstrap.env');
  if (!existsSync(bootstrapPath)) {
    return false;
  }

  const probeEnv = { ...process.env };
  loadEnvFile(bootstrapPath, { into: probeEnv });
  loadEnvFile(resolve(rootDir, 'temp/settlement-keys.env'), { into: probeEnv });
  return Boolean(probeEnv.BOSSRAID_BOUNTY_ESCROW_ADDRESS?.trim());
}

export function resolveBountyE2eMode(cliMode) {
  const mode =
    cliMode?.trim() ||
    process.env.BOSSRAID_E2E_MODE?.trim() ||
    process.env.BOSSRAID_BOUNTY_E2E_MODE?.trim() ||
    process.env.BOSSRAID_X402_E2E_MODE?.trim() ||
    'mock';

  if (mode !== 'mock' && mode !== 'wallet' && mode !== 'unverified') {
    throw new Error(`Unsupported bounty e2e mode "${mode}". Use mock, wallet, or unverified.`);
  }

  return mode;
}

export function resolveRewardUsd() {
  const rewardUsd = Number(
    process.env.BOSSRAID_E2E_REWARD_USD ?? process.env.BOSSRAID_BOUNTY_E2E_REWARD_USD ?? '0.5'
  );
  if (!Number.isFinite(rewardUsd) || rewardUsd <= 0) {
    throw new Error('BOSSRAID_BOUNTY_E2E_REWARD_USD must be a positive number.');
  }
  return rewardUsd;
}

export function canVerifyOnchain() {
  return Boolean(
    process.env.BOSSRAID_RPC_URL?.trim() && process.env.BOSSRAID_BOUNTY_ESCROW_ADDRESS?.trim()
  );
}

export function loadProviderAddressMapJson(rootDir) {
  const mapPath = resolve(rootDir, 'examples/provider-addresses.json');
  if (!existsSync(mapPath)) {
    return undefined;
  }
  return readFileSync(mapPath, 'utf8').trim();
}
