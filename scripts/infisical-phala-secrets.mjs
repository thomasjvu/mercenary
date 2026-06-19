import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  deleteInfisicalSecret,
  ensureInfisicalSecretPath,
  listInfisicalSecrets,
  resolveInfisicalConfig,
  upsertInfisicalSecret,
} from './infisical-client.mjs';
import {
  INFISICAL_PHALA_CORE_PATH,
  INFISICAL_PHALA_ONCHAIN_PATH,
  LEGACY_INFISICAL_PHALA_PATH,
  assembleDeployEnv,
  formatDotenvEntries,
  parseDotenv,
  splitDeployEnv,
} from './lib/phala-secret-tiers.mjs';

const command = process.argv[2] ?? 'help';
const args = parseArgs(process.argv.slice(3));
const envName = args.env ?? process.env.INFISICAL_ENV ?? 'prod';
const envFile = resolve(
  process.cwd(),
  args.file ?? process.env.BOSSRAID_PHALA_ENV_FILE ?? 'deploy/phala/.env'
);
const coreFile = resolve(
  process.cwd(),
  args.coreFile ?? process.env.BOSSRAID_PHALA_CORE_ENV_FILE ?? 'deploy/phala/secrets.core.env'
);
const onchainFile = resolve(
  process.cwd(),
  args.onchainFile ??
    process.env.BOSSRAID_PHALA_ONCHAIN_ENV_FILE ??
    'deploy/phala/secrets.onchain.env'
);

switch (command) {
  case 'pull':
    await pullSecrets();
    break;
  case 'push':
    await pushSecrets();
    break;
  case 'prune-legacy':
    await pruneLegacySecrets();
    break;
  case 'check':
    runPreflight(envFile);
    break;
  case 'help':
  case '--help':
  case '-h':
    printHelp();
    break;
  default:
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

async function pullSecrets() {
  const config = resolveInfisicalConfig({ projectId: args.projectId, domain: args.domain });
  const coreSecrets = await listInfisicalSecrets({
    ...config,
    envName,
    secretPath: INFISICAL_PHALA_CORE_PATH,
  });
  const onchainSecrets = await listInfisicalSecrets({
    ...config,
    envName,
    secretPath: INFISICAL_PHALA_ONCHAIN_PATH,
  });

  if (coreSecrets.length === 0) {
    console.error(
      `No secrets found at ${envName}:${INFISICAL_PHALA_CORE_PATH}. Run push after bootstrapping deploy/phala/secrets.core.env.`
    );
    process.exit(1);
  }

  const core = Object.fromEntries(
    coreSecrets.map((secret) => [secret.secretKey, secret.secretValue ?? ''])
  );
  const onchain = Object.fromEntries(
    onchainSecrets.map((secret) => [secret.secretKey, secret.secretValue ?? ''])
  );
  const assembled = assembleDeployEnv(core, onchain);

  mkdirSync(dirname(envFile), { recursive: true });
  mkdirSync(dirname(coreFile), { recursive: true });
  writeFileSync(coreFile, formatDotenvEntries(core), 'utf8');
  if (Object.keys(onchain).length > 0) {
    mkdirSync(dirname(onchainFile), { recursive: true });
    writeFileSync(onchainFile, formatDotenvEntries(onchain), 'utf8');
  }
  writeFileSync(envFile, formatDotenvEntries(assembled), 'utf8');

  console.log(
    [
      `Pulled Infisical ${envName}:${INFISICAL_PHALA_CORE_PATH} (${coreSecrets.length} secrets).`,
      onchainSecrets.length > 0
        ? `Pulled Infisical ${envName}:${INFISICAL_PHALA_ONCHAIN_PATH} (${onchainSecrets.length} secrets).`
        : `No onchain overlay at ${envName}:${INFISICAL_PHALA_ONCHAIN_PATH}.`,
      `Assembled ${envFile} (${Object.keys(assembled).length} deploy keys).`,
    ].join('\n')
  );
  runPreflight(envFile);
}

async function pushSecrets() {
  const tierEntries = readTierEntries();
  const assembled = assembleDeployEnv(tierEntries.core, tierEntries.onchain);
  mkdirSync(dirname(envFile), { recursive: true });
  writeFileSync(envFile, formatDotenvEntries(assembled), 'utf8');
  runPreflight(envFile);

  const config = resolveInfisicalConfig({ projectId: args.projectId, domain: args.domain });
  const coreCount = await pushTier({
    config,
    envName,
    secretPath: INFISICAL_PHALA_CORE_PATH,
    entries: Object.entries(tierEntries.core),
    label: 'core',
  });
  const onchainCount = await pushTier({
    config,
    envName,
    secretPath: INFISICAL_PHALA_ONCHAIN_PATH,
    entries: Object.entries(tierEntries.onchain),
    label: 'onchain',
  });

  console.log(
    [
      `Pushed ${coreCount.written} secrets into ${envName}:${INFISICAL_PHALA_CORE_PATH} (${coreCount.created} created, ${coreCount.updated} updated).`,
      onchainCount.written > 0
        ? `Pushed ${onchainCount.written} secrets into ${envName}:${INFISICAL_PHALA_ONCHAIN_PATH} (${onchainCount.created} created, ${onchainCount.updated} updated).`
        : `Skipped empty onchain overlay (${envName}:${INFISICAL_PHALA_ONCHAIN_PATH}).`,
    ].join('\n')
  );
}

async function pruneLegacySecrets() {
  const config = resolveInfisicalConfig({ projectId: args.projectId, domain: args.domain });
  const legacySecrets = await listInfisicalSecrets({
    ...config,
    envName,
    secretPath: LEGACY_INFISICAL_PHALA_PATH,
  });
  if (legacySecrets.length === 0) {
    console.log(`No legacy secrets at ${envName}:${LEGACY_INFISICAL_PHALA_PATH}.`);
    return;
  }

  let deleted = 0;
  for (const secret of legacySecrets) {
    const removed = await deleteInfisicalSecret({
      ...config,
      envName,
      secretPath: LEGACY_INFISICAL_PHALA_PATH,
      key: secret.secretKey,
    });
    if (removed) {
      deleted += 1;
    }
  }

  console.log(
    `Removed ${deleted} legacy secrets from ${envName}:${LEGACY_INFISICAL_PHALA_PATH}.`
  );
}

function readTierEntries() {
  if (existsSync(coreFile)) {
    const core = parseDotenv(readFileSync(coreFile, 'utf8'));
    const onchain = existsSync(onchainFile)
      ? parseDotenv(readFileSync(onchainFile, 'utf8'))
      : {};
    return { core, onchain };
  }

  if (!existsSync(envFile)) {
    console.error(`Env file not found: ${envFile}`);
    console.error('Run: pnpm bootstrap:phala:env');
    process.exit(1);
  }

  return splitDeployEnv(parseDotenv(readFileSync(envFile, 'utf8')));
}

async function pushTier({ config, envName, secretPath, entries, label }) {
  if (entries.length === 0) {
    return { written: 0, created: 0, updated: 0 };
  }

  await ensureInfisicalSecretPath({
    ...config,
    envName,
    secretPath,
  });
  const existingSecrets = await listInfisicalSecrets({
    ...config,
    envName,
    secretPath,
  });
  const existingKeys = new Set(existingSecrets.map((secret) => secret.secretKey));

  let created = 0;
  let updated = 0;
  for (const [key, value] of entries) {
    const exists = existingKeys.has(key);
    await upsertInfisicalSecret({
      ...config,
      envName,
      secretPath,
      key,
      value,
      exists,
    });
    if (exists) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  return { written: entries.length, created, updated, label };
}

function runPreflight(file) {
  const result = spawnSync('node', ['scripts/phala-secrets-preflight.mjs', file], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    if (result.stdout.trim()) {
      console.error(result.stdout.trim());
    }
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
    process.exit(result.status ?? 1);
  }

  console.log(`Preflight passed for ${file}.`);
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const value = rawArgs[index];
    if (!value?.startsWith('--')) {
      continue;
    }
    const [rawKey, inlineValue] = value.slice(2).split('=', 2);
    if (!rawKey) {
      continue;
    }
    if (inlineValue != null) {
      parsed[rawKey] = inlineValue;
      continue;
    }
    const nextValue = rawArgs[index + 1];
    if (nextValue && !nextValue.startsWith('--')) {
      parsed[rawKey] = nextValue;
      index += 1;
      continue;
    }
    parsed[rawKey] = 'true';
  }
  return parsed;
}

function printHelp() {
  console.log(
    [
      'Usage:',
      '  node scripts/infisical-phala-secrets.mjs pull [--env prod] [--file deploy/phala/.env]',
      '  node scripts/infisical-phala-secrets.mjs push [--env prod] [--file deploy/phala/.env]',
      '  node scripts/infisical-phala-secrets.mjs prune-legacy [--env prod]',
      '  node scripts/infisical-phala-secrets.mjs check [--file deploy/phala/.env]',
      '',
      'Infisical paths:',
      `  core: ${INFISICAL_PHALA_CORE_PATH}`,
      `  onchain: ${INFISICAL_PHALA_ONCHAIN_PATH}`,
      `  legacy (prune): ${LEGACY_INFISICAL_PHALA_PATH}`,
      '',
      'Bootstrap:',
      '  pnpm bootstrap:phala:env',
      '',
      'Environment overrides:',
      '  INFISICAL_ENV, INFISICAL_PROJECT_ID, INFISICAL_API_URL',
      '  INFISICAL_ACCESS_TOKEN, INFISICAL_MACHINE_CLIENT_ID/SECRET, CF_ACCESS_CLIENT_ID/SECRET',
      '  BOSSRAID_PHALA_ENV_FILE, BOSSRAID_PHALA_CORE_ENV_FILE, BOSSRAID_PHALA_ONCHAIN_ENV_FILE',
    ].join('\n')
  );
}