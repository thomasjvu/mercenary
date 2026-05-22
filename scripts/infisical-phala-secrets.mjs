import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const command = process.argv[2] ?? 'help';
const args = parseArgs(process.argv.slice(3));
const envName = args.env ?? process.env.INFISICAL_ENV ?? 'prod';
const secretPath = args.path ?? process.env.INFISICAL_PATH ?? '/bossraid/phala';
const envFile = resolve(
  process.cwd(),
  args.file ?? process.env.BOSSRAID_PHALA_ENV_FILE ?? 'deploy/phala/.env'
);
const projectId = args.projectId ?? process.env.INFISICAL_PROJECT_ID;
const token = args.token ?? process.env.INFISICAL_TOKEN;
const domain =
  args.domain ?? process.env.INFISICAL_API_URL ?? process.env.INFISICAL_DOMAIN ?? undefined;

switch (command) {
  case 'pull':
    pullSecrets();
    break;
  case 'push':
    pushSecrets();
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

function pullSecrets() {
  mkdirSync(dirname(envFile), { recursive: true });
  runInfisical(
    [
      'export',
      '--env',
      envName,
      '--path',
      secretPath,
      '--format',
      'dotenv',
      '--output-file',
      envFile,
    ],
    {
      successMessage: `Pulled Infisical ${envName}:${secretPath} into ${envFile}.`,
    }
  );
  runPreflight(envFile);
}

function pushSecrets() {
  if (!existsSync(envFile)) {
    console.error(`Env file not found: ${envFile}`);
    console.error('Create it from deploy/phala/production.env.example and fill real values first.');
    process.exit(1);
  }

  runPreflight(envFile);
  runInfisical(['secrets', 'set', '--env', envName, '--path', secretPath, '--file', envFile], {
    successMessage: `Pushed ${envFile} into Infisical ${envName}:${secretPath}.`,
  });
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

function runInfisical(commandArgs, options) {
  const fullArgs = [...commandArgs];
  if (projectId) {
    fullArgs.push('--projectId', projectId);
  }
  if (token) {
    fullArgs.push('--token', token);
  }
  if (domain) {
    fullArgs.push('--domain', domain);
  }
  fullArgs.push('--silent');

  const result = spawnSync('infisical', fullArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    console.error(`Infisical command failed: infisical ${redactArgs(fullArgs).join(' ')}`);
    if (result.stderr.trim()) {
      console.error(result.stderr.trim());
    }
    process.exit(result.status ?? 1);
  }

  console.log(options.successMessage);
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

function redactArgs(args) {
  const redacted = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    redacted.push(arg);
    if (arg === '--token') {
      index += 1;
      redacted.push('<redacted>');
    }
  }
  return redacted;
}

function printHelp() {
  console.log(
    [
      'Usage:',
      '  node scripts/infisical-phala-secrets.mjs pull [--env prod] [--path /bossraid/phala] [--file deploy/phala/.env]',
      '  node scripts/infisical-phala-secrets.mjs push [--env prod] [--path /bossraid/phala] [--file deploy/phala/.env]',
      '  node scripts/infisical-phala-secrets.mjs check [--file deploy/phala/.env]',
      '',
      'Environment overrides:',
      '  INFISICAL_ENV, INFISICAL_PATH, INFISICAL_PROJECT_ID, INFISICAL_TOKEN, INFISICAL_API_URL',
      '  BOSSRAID_PHALA_ENV_FILE',
    ].join('\n')
  );
}
