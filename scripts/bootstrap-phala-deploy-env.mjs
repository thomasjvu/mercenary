import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const workspaceRoot = process.cwd();
const outputPath = resolve(workspaceRoot, process.argv[2] ?? 'deploy/phala/.env');

function parseDotenv(text) {
  const entries = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    if (key) {
      entries[key] = value;
    }
  }
  return entries;
}

function readOptionalEnv(path) {
  if (!existsSync(path)) {
    return {};
  }
  return parseDotenv(readFileSync(path, 'utf8'));
}

function isRealValue(value) {
  if (!value?.trim()) {
    return false;
  }
  const trimmed = value.trim();
  return !(
    /^<.+>$/u.test(trimmed) ||
    /replace|changeme|todo|from-|your-org/iu.test(trimmed) ||
    /^0x0+$/iu.test(trimmed)
  );
}

function requireValue(entries, key, source) {
  const value = entries[key]?.trim();
  if (!isRealValue(value)) {
    throw new Error(`Missing ${key} in ${source}`);
  }
  return value;
}

function token(bytes = 32) {
  return randomBytes(bytes).toString('hex');
}

const merged = {
  ...parseDotenv(
    readFileSync(resolve(workspaceRoot, 'deploy/phala/production.env.example'), 'utf8')
  ),
  ...readOptionalEnv(resolve(workspaceRoot, 'temp/settlement-keys.env')),
  ...readOptionalEnv(resolve(workspaceRoot, 'temp/contracts/settlement.env')),
  ...readOptionalEnv(resolve(workspaceRoot, '.private/.env')),
  ...readOptionalEnv(resolve(workspaceRoot, '.env')),
};

const veniceApiKey = [
  merged.VENICE_API_KEY_DOTTIE,
  merged.VENICE_API_KEY_RIKO,
  merged.VENICE_API_KEY_GAMMA,
  merged.VENICE_API_KEY,
  merged.BOSSRAID_VENICE_API_KEY,
].find((value) => isRealValue(value));
const providerModel = merged.VENICE_MODEL ?? merged.BOSSRAID_VENICE_MODEL ?? 'minimax-m27';
const providerModelBase = merged.VENICE_API_BASE ?? 'https://api.venice.ai/api/v1';

const values = {
  BOSSRAID_IMAGE: 'ghcr.io/thomasjvu/boss-raid:latest',
  BOSSRAID_EVALUATOR_IMAGE: 'ghcr.io/thomasjvu/boss-raid-evaluator:latest',
  BOSSRAID_EVAL_JOB_CONTAINER_IMAGE: 'ghcr.io/thomasjvu/boss-raid-evaluator-job:latest',
  BOSSRAID_PROVIDERS_FILE: '/app/examples/game-raid/providers.compose.json',
  BOSSRAID_TEE_SOCKET_PATH: '/var/run/tappd.sock',
  BOSSRAID_SECRET_ENCRYPTION_KEY_ID: 'phala-2026-05',
  BOSSRAID_SETTLEMENT_MODE: isRealValue(merged.BOSSRAID_REGISTRY_ADDRESS) ? 'onchain' : 'file',
  BOSSRAID_SETTLEMENT_FUND_JOBS: 'true',
  BOSSRAID_SETTLEMENT_REQUIRE_TERMINAL_JOBS: 'true',
  BOSSRAID_X402_ENABLED: 'true',
  BOSSRAID_X402_NETWORK: 'eip155:8453',
  BOSSRAID_X402_ASSET: 'usdc',
  BOSSRAID_X402_ASSET_NAME: 'USDC',
  BOSSRAID_X402_FACILITATOR_URL: 'https://facilitator.payai.network',
  BOSSRAID_X402_PAY_TO: '0x3bd7717267c6A2D29F07Da83D59155Ac6cD80A69',
  BOSSRAID_RPC_URL: 'https://mainnet.base.org',
  BOSSRAID_CHAIN_ID: '8453',
  BOSSRAID_TOKEN_ADDRESS: '0x833589fCD6eDb6B08d2E354A1d9441D5b2AaE4a5',
  BOSSRAID_PUBLIC_RATE_LIMIT_MAX: '60',
  BOSSRAID_PUBLIC_RATE_LIMIT_WINDOW_MS: '60000',
  BOSSRAID_BUYER_KEY_RATE_LIMIT_MAX: '120',
  BOSSRAID_BUYER_KEY_RATE_LIMIT_WINDOW_MS: '60000',
  BOSSRAID_BUYER_KEY_DEFAULT_SPEND_LIMIT_USD: '25',
  BOSSRAID_BUYER_MAX_REQUEST_BUDGET_USD: '5',
  BOSSRAID_METRICS_PUBLIC: 'false',
  BOSSRAID_OPERATOR_TERMS_ACK: 'true',
  BOSSRAID_INCIDENT_RESPONSE_ACK: 'true',
  BOSSRAID_ADMIN_TOKEN: requireValue(merged, 'BOSSRAID_ADMIN_TOKEN', '.env'),
  BOSSRAID_REGISTRY_TOKEN: requireValue(merged, 'BOSSRAID_REGISTRY_TOKEN', '.env'),
  BOSSRAID_SECRET_ENCRYPTION_KEY: requireValue(merged, 'BOSSRAID_SECRET_ENCRYPTION_KEY', '.env'),
  BOSSRAID_EVAL_SANDBOX_TOKEN: isRealValue(merged.BOSSRAID_EVAL_SANDBOX_TOKEN)
    ? merged.BOSSRAID_EVAL_SANDBOX_TOKEN.trim()
    : token(),
  BOSSRAID_CLIENT_PRIVATE_KEY: requireValue(
    merged,
    'BOSSRAID_CLIENT_PRIVATE_KEY',
    'settlement-keys.env'
  ),
  BOSSRAID_EVALUATOR_ADDRESS: requireValue(
    merged,
    'BOSSRAID_EVALUATOR_ADDRESS',
    'settlement-keys.env'
  ),
  BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY: requireValue(
    merged,
    'BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY',
    'settlement-keys.env'
  ),
  BOSSRAID_PROVIDER_ADDRESS_MAP_JSON: requireValue(
    merged,
    'BOSSRAID_PROVIDER_ADDRESS_MAP_JSON',
    'settlement-keys.env'
  ),
  BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON: requireValue(
    merged,
    'BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON',
    'settlement-keys.env'
  ),
  PAYAI_API_KEY_ID: requireValue(merged, 'PAYAI_API_KEY_ID', '.env'),
  PAYAI_API_KEY_SECRET: requireValue(merged, 'PAYAI_API_KEY_SECRET', '.env'),
  BOSSRAID_PROVIDER_A_TOKEN: isRealValue(merged.BOSSRAID_PROVIDER_A_TOKEN)
    ? merged.BOSSRAID_PROVIDER_A_TOKEN.trim()
    : token(16),
  BOSSRAID_PROVIDER_B_TOKEN: isRealValue(merged.BOSSRAID_PROVIDER_B_TOKEN)
    ? merged.BOSSRAID_PROVIDER_B_TOKEN.trim()
    : token(16),
  BOSSRAID_PROVIDER_C_TOKEN: isRealValue(merged.BOSSRAID_PROVIDER_C_TOKEN)
    ? merged.BOSSRAID_PROVIDER_C_TOKEN.trim()
    : token(16),
  BOSSRAID_PROVIDER_A_ID: 'dottie',
  BOSSRAID_PROVIDER_A_NAME: 'Dottie',
  BOSSRAID_PROVIDER_A_MODE: 'pixel_art',
  BOSSRAID_PROVIDER_A_INSTRUCTIONS:
    'Specialize in pixel-art asset packs, spritesheets, UI frames, and compact retro palettes.',
  BOSSRAID_PROVIDER_B_ID: 'riko',
  BOSSRAID_PROVIDER_B_NAME: 'Riko',
  BOSSRAID_PROVIDER_B_MODE: 'remotion',
  BOSSRAID_PROVIDER_B_INSTRUCTIONS:
    'Specialize in game marketing videos, teaser hooks, launch copy, and Remotion-ready promo bundles.',
  BOSSRAID_PROVIDER_C_ID: 'gamma',
  BOSSRAID_PROVIDER_C_NAME: 'Gamma',
  BOSSRAID_PROVIDER_C_MODE: 'gbstudio',
  BOSSRAID_PROVIDER_C_INSTRUCTIONS:
    'Specialize in small game-development slices, gameplay logic, and minimal repo patches that keep one clear hook.',
  BOSSRAID_PROVIDER_A_MODEL_API_KEY: isRealValue(merged.BOSSRAID_PROVIDER_A_MODEL_API_KEY)
    ? merged.BOSSRAID_PROVIDER_A_MODEL_API_KEY
    : isRealValue(merged.VENICE_API_KEY_DOTTIE)
      ? merged.VENICE_API_KEY_DOTTIE
      : veniceApiKey,
  BOSSRAID_PROVIDER_A_MODEL_API_BASE:
    merged.BOSSRAID_PROVIDER_A_MODEL_API_BASE ?? providerModelBase,
  BOSSRAID_PROVIDER_A_MODEL: isRealValue(merged.BOSSRAID_PROVIDER_A_MODEL)
    ? merged.BOSSRAID_PROVIDER_A_MODEL
    : providerModel,
  BOSSRAID_PROVIDER_B_MODEL_API_KEY: isRealValue(merged.BOSSRAID_PROVIDER_B_MODEL_API_KEY)
    ? merged.BOSSRAID_PROVIDER_B_MODEL_API_KEY
    : isRealValue(merged.VENICE_API_KEY_RIKO)
      ? merged.VENICE_API_KEY_RIKO
      : veniceApiKey,
  BOSSRAID_PROVIDER_B_MODEL_API_BASE:
    merged.BOSSRAID_PROVIDER_B_MODEL_API_BASE ?? providerModelBase,
  BOSSRAID_PROVIDER_B_MODEL: isRealValue(merged.BOSSRAID_PROVIDER_B_MODEL)
    ? merged.BOSSRAID_PROVIDER_B_MODEL
    : providerModel,
  BOSSRAID_PROVIDER_C_MODEL_API_KEY: isRealValue(merged.BOSSRAID_PROVIDER_C_MODEL_API_KEY)
    ? merged.BOSSRAID_PROVIDER_C_MODEL_API_KEY
    : isRealValue(merged.VENICE_API_KEY_GAMMA)
      ? merged.VENICE_API_KEY_GAMMA
      : veniceApiKey,
  BOSSRAID_PROVIDER_C_MODEL_API_BASE:
    merged.BOSSRAID_PROVIDER_C_MODEL_API_BASE ?? providerModelBase,
  BOSSRAID_PROVIDER_C_MODEL: isRealValue(merged.BOSSRAID_PROVIDER_C_MODEL)
    ? merged.BOSSRAID_PROVIDER_C_MODEL
    : providerModel,
};

for (const key of [
  'BOSSRAID_REGISTRY_ADDRESS',
  'BOSSRAID_ESCROW_ADDRESS',
  'BOSSRAID_BOUNTY_ESCROW_ADDRESS',
  'BOSSRAID_ERC8004_AGENT_ID',
  'BOSSRAID_ERC8004_OPERATOR_WALLET',
  'BOSSRAID_ERC8004_REGISTRATION_TX',
  'BOSSRAID_ERC8004_IDENTITY_REGISTRY',
]) {
  const value = merged[key]?.trim();
  if (isRealValue(value)) {
    values[key] = value;
  }
}

const body = Object.entries(values)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([key, value]) => `${key}=${value}`)
  .join('\n')
  .concat('\n');

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, body, 'utf8');
console.log(
  `Wrote ${outputPath} (${Object.keys(values).length} keys, settlement=${values.BOSSRAID_SETTLEMENT_MODE}).`
);
