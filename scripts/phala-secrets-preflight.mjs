import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), process.argv[2] ?? 'deploy/phala/.env');

const required = [
  'BOSSRAID_IMAGE',
  'BOSSRAID_EVALUATOR_IMAGE',
  'BOSSRAID_ADMIN_TOKEN',
  'BOSSRAID_SECRET_ENCRYPTION_KEY',
  'BOSSRAID_EVAL_SANDBOX_TOKEN',
  'BOSSRAID_EVAL_JOB_CONTAINER_IMAGE',
  'BOSSRAID_TEE_SOCKET_PATH',
  'BOSSRAID_X402_PAY_TO',
  'BOSSRAID_X402_NETWORK',
  'BOSSRAID_X402_ASSET',
  'BOSSRAID_SETTLEMENT_MODE',
  'BOSSRAID_BUYER_KEY_DEFAULT_SPEND_LIMIT_USD',
  'BOSSRAID_BUYER_MAX_REQUEST_BUDGET_USD',
  'BOSSRAID_OPERATOR_TERMS_ACK',
  'BOSSRAID_INCIDENT_RESPONSE_ACK',
];

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
  'PAYAI_API_KEY_SECRET',
  'CDP_API_KEY_SECRET',
];

const env = readEnvFile(envPath);
const missing = [];
const weak = [];
const presentSecrets = [];

for (const key of required) {
  if (!isRealValue(env[key])) {
    missing.push(key);
  }
}

if (env.BOSSRAID_SETTLEMENT_MODE === 'onchain') {
  for (const key of onchainRequired) {
    if (!isRealValue(env[key])) {
      missing.push(key);
    }
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

for (const key of secretLike) {
  if (isRealValue(env[key])) {
    presentSecrets.push(key);
  }
}

const report = {
  envFile: envPath,
  ok: missing.length === 0 && weak.length === 0,
  checked: {
    required: required.length,
    onchainRequired: env.BOSSRAID_SETTLEMENT_MODE === 'onchain' ? onchainRequired.length : 0,
    secretFieldsPresent: presentSecrets.length,
  },
  presentSecrets,
  missing,
  weak,
};

console.log(JSON.stringify(report, null, 2));

if (!report.ok) {
  process.exit(1);
}

function readEnvFile(path) {
  if (!existsSync(path)) {
    console.error(`Secret env file not found: ${path}`);
    process.exit(1);
  }

  const parsed = {};
  const raw = readFileSync(path, 'utf8');
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
    parsed[key] = value;
  }
  return parsed;
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
