import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PHALA_CORE_KEYS,
  PHALA_ONCHAIN_KEYS,
  isRealValue,
  parseDotenv,
} from './lib/phala-secret-tiers.mjs';

const envPath = resolve(process.cwd(), process.argv[2] ?? 'deploy/phala/.env');
const tier = process.argv[3] ?? 'deploy';

const coreRequired = PHALA_CORE_KEYS;
const onchainRequired = [
  'BOSSRAID_RPC_URL',
  'BOSSRAID_CHAIN_ID',
  'BOSSRAID_REGISTRY_ADDRESS',
  'BOSSRAID_ESCROW_ADDRESS',
  'BOSSRAID_BOUNTY_ESCROW_ADDRESS',
  'BOSSRAID_TOKEN_ADDRESS',
  'BOSSRAID_CLIENT_PRIVATE_KEY',
  'BOSSRAID_EVALUATOR_ADDRESS',
];

const secretLike = [
  'BOSSRAID_ADMIN_TOKEN',
  'BOSSRAID_REGISTRY_TOKEN',
  'BOSSRAID_SECRET_ENCRYPTION_KEY',
  'BOSSRAID_CLIENT_PRIVATE_KEY',
  'BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY',
  'BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON',
  'BOSSRAID_EVAL_SANDBOX_TOKEN',
  'BOSSRAID_VENICE_API_KEY',
  'PAYAI_API_KEY_SECRET',
  'CDP_API_KEY_SECRET',
];

const env = readEnvFile(envPath);
const missing = [];
const weak = [];
const presentSecrets = [];

if (tier === 'core') {
  validateKeys(coreRequired);
} else if (tier === 'onchain') {
  validateKeys(onchainRequired);
} else {
  validateKeys(coreRequired);
  if (env.BOSSRAID_SETTLEMENT_MODE === 'onchain') {
    validateKeys(onchainRequired);
  }
  validateLaunchPolicy();
}

for (const key of secretLike) {
  if (isRealValue(env[key])) {
    presentSecrets.push(key);
  }
}

if (isRealValue(env.BOSSRAID_SECRET_ENCRYPTION_KEY)) {
  const encryptionKey = env.BOSSRAID_SECRET_ENCRYPTION_KEY.trim();
  if (!isStrongEncryptionKey(encryptionKey)) {
    weak.push(
      'BOSSRAID_SECRET_ENCRYPTION_KEY must be 32-byte base64, 64-char hex, or at least 32 chars.'
    );
  }
}

const report = {
  envFile: envPath,
  tier,
  ok: missing.length === 0 && weak.length === 0,
  checked: {
    coreRequired: coreRequired.length,
    onchainRequired:
      tier === 'onchain' || env.BOSSRAID_SETTLEMENT_MODE === 'onchain'
        ? onchainRequired.length
        : 0,
    secretFieldsPresent: presentSecrets.length,
    infisicalCoreKeys: PHALA_CORE_KEYS.length,
    infisicalOnchainKeys: PHALA_ONCHAIN_KEYS.length,
  },
  presentSecrets,
  missing,
  weak,
};

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exit(1);
}

function validateKeys(keys) {
  for (const key of keys) {
    if (!isRealValue(env[key])) {
      missing.push(key);
    }
  }
}

function validateLaunchPolicy() {
  for (const key of ['BOSSRAID_OPERATOR_TERMS_ACK', 'BOSSRAID_INCIDENT_RESPONSE_ACK']) {
    if (env[key] !== 'true') {
      weak.push(`${key} must be true before full production launch.`);
    }
  }

  for (const key of [
    'BOSSRAID_BUYER_KEY_DEFAULT_SPEND_LIMIT_USD',
    'BOSSRAID_BUYER_MAX_REQUEST_BUDGET_USD',
  ]) {
    if (!isPositiveNumber(env[key])) {
      weak.push(`${key} must be a positive numeric USD value.`);
    }
  }
}

function readEnvFile(path) {
  if (!existsSync(path)) {
    console.error(`Secret env file not found: ${path}`);
    process.exit(1);
  }

  return parseDotenv(readFileSync(path, 'utf8'));
}

function isStrongEncryptionKey(value) {
  if (/^[a-f0-9]{64}$/iu.test(value)) {
    return true;
  }

  try {
    if (Buffer.from(value, 'base64').length === 32) {
      return true;
    }
  } catch {
    return false;
  }

  return value.length >= 32;
}

function isPositiveNumber(value) {
  if (!value?.trim()) {
    return false;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}