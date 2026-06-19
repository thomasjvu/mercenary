import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  assembleDeployEnv,
  formatDotenvEntries,
  isRealValue,
  parseDotenv,
  pickTierEntries,
  resolveVeniceApiKey,
} from './lib/phala-secret-tiers.mjs';

const workspaceRoot = process.cwd();
const outputPath = resolve(workspaceRoot, process.argv[2] ?? 'deploy/phala/.env');
const coreOutputPath = resolve(workspaceRoot, 'deploy/phala/secrets.core.env');
const onchainOutputPath = resolve(workspaceRoot, 'deploy/phala/secrets.onchain.env');

function readOptionalEnv(path) {
  if (!existsSync(path)) {
    return {};
  }
  return parseDotenv(readFileSync(path, 'utf8'));
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

function imageDigestRef(envKey, repository, merged) {
  const digest = process.env[envKey] ?? merged[envKey];
  if (!isRealValue(digest)) {
    return `${repository}:latest`;
  }
  const normalized = digest.trim().startsWith('sha256:') ? digest.trim() : `sha256:${digest.trim()}`;
  return `${repository}@${normalized}`;
}

const merged = {
  ...parseDotenv(
    readFileSync(resolve(workspaceRoot, 'deploy/phala/secrets.core.env.example'), 'utf8')
  ),
  ...readOptionalEnv(resolve(workspaceRoot, 'deploy/phala/secrets.core.env')),
  ...readOptionalEnv(resolve(workspaceRoot, 'deploy/phala/secrets.onchain.env')),
  ...readOptionalEnv(resolve(workspaceRoot, 'temp/settlement-keys.env')),
  ...readOptionalEnv(resolve(workspaceRoot, 'temp/contracts/settlement.env')),
  ...readOptionalEnv(resolve(workspaceRoot, '.private/.env')),
  ...readOptionalEnv(resolve(workspaceRoot, '.env')),
};

const veniceApiKey = resolveVeniceApiKey(merged);

const core = {
  BOSSRAID_IMAGE: isRealValue(merged.BOSSRAID_IMAGE)
    ? merged.BOSSRAID_IMAGE.trim()
    : imageDigestRef('BOSSRAID_IMAGE_DIGEST', 'ghcr.io/thomasjvu/boss-raid', merged),
  BOSSRAID_EVALUATOR_IMAGE: isRealValue(merged.BOSSRAID_EVALUATOR_IMAGE)
    ? merged.BOSSRAID_EVALUATOR_IMAGE.trim()
    : imageDigestRef('BOSSRAID_EVALUATOR_IMAGE_DIGEST', 'ghcr.io/thomasjvu/boss-raid-evaluator', merged),
  BOSSRAID_EVAL_JOB_CONTAINER_IMAGE: isRealValue(merged.BOSSRAID_EVAL_JOB_CONTAINER_IMAGE)
    ? merged.BOSSRAID_EVAL_JOB_CONTAINER_IMAGE.trim()
    : imageDigestRef(
        'BOSSRAID_EVAL_JOB_IMAGE_DIGEST',
        'ghcr.io/thomasjvu/boss-raid-evaluator-job',
        merged
      ),
  BOSSRAID_ADMIN_TOKEN: requireValue(merged, 'BOSSRAID_ADMIN_TOKEN', '.env'),
  BOSSRAID_REGISTRY_TOKEN: requireValue(merged, 'BOSSRAID_REGISTRY_TOKEN', '.env'),
  BOSSRAID_SECRET_ENCRYPTION_KEY: requireValue(merged, 'BOSSRAID_SECRET_ENCRYPTION_KEY', '.env'),
  BOSSRAID_EVAL_SANDBOX_TOKEN: isRealValue(merged.BOSSRAID_EVAL_SANDBOX_TOKEN)
    ? merged.BOSSRAID_EVAL_SANDBOX_TOKEN.trim()
    : token(),
  BOSSRAID_PROVIDER_A_TOKEN: isRealValue(merged.BOSSRAID_PROVIDER_A_TOKEN)
    ? merged.BOSSRAID_PROVIDER_A_TOKEN.trim()
    : token(16),
  BOSSRAID_PROVIDER_B_TOKEN: isRealValue(merged.BOSSRAID_PROVIDER_B_TOKEN)
    ? merged.BOSSRAID_PROVIDER_B_TOKEN.trim()
    : token(16),
  BOSSRAID_PROVIDER_C_TOKEN: isRealValue(merged.BOSSRAID_PROVIDER_C_TOKEN)
    ? merged.BOSSRAID_PROVIDER_C_TOKEN.trim()
    : token(16),
  PAYAI_API_KEY_ID: requireValue(merged, 'PAYAI_API_KEY_ID', '.env'),
  PAYAI_API_KEY_SECRET: requireValue(merged, 'PAYAI_API_KEY_SECRET', '.env'),
  BOSSRAID_X402_PAY_TO:
    merged.BOSSRAID_X402_PAY_TO?.trim() ?? '0x3bd7717267c6A2D29F07Da83D59155Ac6cD80A69',
};

if (veniceApiKey) {
  core.BOSSRAID_VENICE_API_KEY = veniceApiKey;
} else {
  throw new Error(
    'Missing upstream inference key. Set BOSSRAID_VENICE_API_KEY or VENICE_API_KEY in .env.'
  );
}

const onchain = pickTierEntries(merged, [
  'BOSSRAID_CLIENT_PRIVATE_KEY',
  'BOSSRAID_EVALUATOR_ADDRESS',
  'BOSSRAID_SETTLEMENT_EVALUATOR_PRIVATE_KEY',
  'BOSSRAID_PROVIDER_ADDRESS_MAP_JSON',
  'BOSSRAID_SETTLEMENT_PROVIDER_PRIVATE_KEYS_JSON',
  'BOSSRAID_REGISTRY_ADDRESS',
  'BOSSRAID_ESCROW_ADDRESS',
  'BOSSRAID_BOUNTY_ESCROW_ADDRESS',
  'BOSSRAID_ERC8004_AGENT_ID',
  'BOSSRAID_ERC8004_OPERATOR_WALLET',
  'BOSSRAID_ERC8004_REGISTRATION_TX',
  'BOSSRAID_ERC8004_IDENTITY_REGISTRY',
]);

const assembled = assembleDeployEnv(core, onchain);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(coreOutputPath, formatDotenvEntries(core), 'utf8');
writeFileSync(outputPath, formatDotenvEntries(assembled), 'utf8');

if (Object.keys(onchain).length > 0) {
  writeFileSync(onchainOutputPath, formatDotenvEntries(onchain), 'utf8');
}

console.log(
  [
    `Wrote ${coreOutputPath} (${Object.keys(core).length} core secrets).`,
    Object.keys(onchain).length > 0
      ? `Wrote ${onchainOutputPath} (${Object.keys(onchain).length} onchain secrets).`
      : 'Skipped onchain tier file (no settlement keys present).',
    `Wrote ${outputPath} (${Object.keys(assembled).length} assembled deploy keys, settlement=${assembled.BOSSRAID_SETTLEMENT_MODE}).`,
  ].join('\n')
);