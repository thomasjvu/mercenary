import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generatePrivateKey } from 'viem/accounts';
import { loadLocalEnv } from '../env.mjs';
import { loadProviderProfiles } from './provider-launcher.mjs';

const DEFAULT_API_BASE = 'http://127.0.0.1:8787';
const DEFAULT_PROVIDER_ID = 'dottie';
const DEFAULT_PROVIDER_TOKEN = 'bossraid-provider-a';

export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export function loadBountyE2eEnv(rootDir) {
  loadLocalEnv(rootDir);
  loadEnvFile(resolve(rootDir, 'temp/settlement-keys.env'));
  loadEnvFile(resolve(rootDir, 'temp/settlement-bootstrap.env'));
}

export function resolveApiBase(cliApiBase) {
  const candidates = [
    cliApiBase,
    process.env.BOSSRAID_API_BASE,
    process.env.BOSSRAID_X402_E2E_API_BASE,
    process.env.BOSSRAID_BOUNTY_E2E_API_BASE,
    process.env.VITE_BOSSRAID_API_BASE,
    DEFAULT_API_BASE,
  ];

  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return DEFAULT_API_BASE;
}

export function resolveBountyProvider(rootDir, cliProviderId) {
  const explicit =
    cliProviderId?.trim() ||
    process.env.BOSSRAID_BOUNTY_E2E_PROVIDER_ID?.trim() ||
    process.env.BOSSRAID_PROVIDER_A_ID?.trim();

  const { providerProfiles } = loadProviderProfiles(rootDir);

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
    process.env.BOSSRAID_BOUNTY_E2E_PROVIDER_TOKEN?.trim() ||
    provider?.auth?.token?.trim() ||
    process.env.BOSSRAID_PROVIDER_A_TOKEN?.trim() ||
    DEFAULT_PROVIDER_TOKEN
  );
}

export function resolvePosterPrivateKey(mode) {
  const candidates = [
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

  if (mode === 'unverified') {
    return generatePrivateKey();
  }

  if (mode === 'mock') {
    return generatePrivateKey();
  }

  throw new Error(
    'BOSSRAID_BOUNTY_E2E_POSTER_PRIVATE_KEY, BOSSRAID_X402_BUYER_PRIVATE_KEY, EVM_PRIVATE_KEY, or BOSSRAID_CLIENT_PRIVATE_KEY is required for --mode wallet.'
  );
}

export function hasOnchainBootstrap(rootDir) {
  const bootstrapPath = resolve(rootDir, 'temp/settlement-bootstrap.env');
  if (!existsSync(bootstrapPath)) {
    return false;
  }

  const probeEnv = { ...process.env };
  loadEnvFileInto(probeEnv, bootstrapPath);
  loadEnvFileInto(probeEnv, resolve(rootDir, 'temp/settlement-keys.env'));
  return Boolean(probeEnv.BOSSRAID_BOUNTY_ESCROW_ADDRESS?.trim());
}

function loadEnvFileInto(target, filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in target)) {
      target[key] = value;
    }
  }
}

export function resolveBountyE2eMode(cliMode) {
  const mode =
    cliMode?.trim() ||
    process.env.BOSSRAID_BOUNTY_E2E_MODE?.trim() ||
    process.env.BOSSRAID_X402_E2E_MODE?.trim() ||
    'mock';

  if (mode !== 'mock' && mode !== 'wallet' && mode !== 'unverified') {
    throw new Error(`Unsupported bounty e2e mode "${mode}". Use mock, wallet, or unverified.`);
  }

  return mode;
}

export function resolveRewardUsd() {
  const rewardUsd = Number(process.env.BOSSRAID_BOUNTY_E2E_REWARD_USD ?? '0.5');
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

export function parseCliArgs(argv) {
  const args = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args.set(key, 'true');
      continue;
    }
    args.set(key, next);
    index += 1;
  }
  return args;
}

export function readCliArg(args, key) {
  const value = args.get(key);
  return value === 'true' ? undefined : value;
}