import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  ensureInfisicalSecretPath,
  formatDotenv,
  listInfisicalSecrets,
  resolveInfisicalConfig,
  upsertInfisicalSecret,
} from './infisical-client.mjs';

const command = process.argv[2] ?? 'help';
const args = parseArgs(process.argv.slice(3));
const envName = args.env ?? process.env.INFISICAL_ENV ?? 'prod';
const secretPath = args.path ?? process.env.INFISICAL_PATH ?? '/bossraid/phala';
const envFile = resolve(
  process.cwd(),
  args.file ?? process.env.BOSSRAID_PHALA_ENV_FILE ?? 'deploy/phala/.env'
);

switch (command) {
  case 'pull':
    await pullSecrets();
    break;
  case 'push':
    await pushSecrets();
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
  const secrets = await listInfisicalSecrets({
    ...config,
    envName,
    secretPath,
  });
  if (secrets.length === 0) {
    console.error(
      `No secrets found at ${envName}:${secretPath} in project ${config.projectId}. Run push after bootstrapping deploy/phala/.env.`
    );
    process.exit(1);
  }

  mkdirSync(dirname(envFile), { recursive: true });
  writeFileSync(envFile, formatDotenv(secrets), 'utf8');
  console.log(
    `Pulled Infisical ${envName}:${secretPath} into ${envFile} (${secrets.length} secrets).`
  );
  runPreflight(envFile);
}

async function pushSecrets() {
  if (!existsSync(envFile)) {
    console.error(`Env file not found: ${envFile}`);
    console.error('Run: node scripts/bootstrap-phala-deploy-env.mjs');
    process.exit(1);
  }

  runPreflight(envFile);
  const config = resolveInfisicalConfig({ projectId: args.projectId, domain: args.domain });
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
  const entries = parseDotenv(readFileSync(envFile, 'utf8'));

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

  console.log(
    `Pushed ${entries.length} secrets into Infisical ${envName}:${secretPath} (${created} created, ${updated} updated).`
  );
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

function parseDotenv(text) {
  const entries = [];
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
      entries.push([key, value]);
    }
  }
  return entries;
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
      '  node scripts/infisical-phala-secrets.mjs pull [--env prod] [--path /bossraid/phala] [--file deploy/phala/.env]',
      '  node scripts/infisical-phala-secrets.mjs push [--env prod] [--path /bossraid/phala] [--file deploy/phala/.env]',
      '  node scripts/infisical-phala-secrets.mjs check [--file deploy/phala/.env]',
      '',
      'Bootstrap:',
      '  node scripts/bootstrap-phala-deploy-env.mjs',
      '',
      'Environment overrides:',
      '  INFISICAL_ENV, INFISICAL_PATH, INFISICAL_PROJECT_ID, INFISICAL_API_URL',
      '  INFISICAL_ACCESS_TOKEN, INFISICAL_EMAIL/PASSWORD, INFISICAL_ORGANIZATION_ID, or machine identity',
      '  CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET (or cloudflared access login)',
      '  BOSSRAID_PHALA_ENV_FILE',
    ].join('\n')
  );
}
