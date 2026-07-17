import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const webDir = resolve(repoRoot, 'apps/web');

const pagesProject = readRequiredEnv('BOSSRAID_CLOUDFLARE_PAGES_PROJECT');
const apiOrigin = normalizeApiOrigin(readRequiredEnv('BOSSRAID_API_ORIGIN'));
const pagesBranch = normalizeOptionalEnv('BOSSRAID_CLOUDFLARE_PAGES_BRANCH');
const accountId =
  normalizeOptionalEnv('CLOUDFLARE_ACCOUNT_ID') ??
  normalizeOptionalEnv('BOSSRAID_CLOUDFLARE_ACCOUNT_ID');

// Prefer explicit account; avoid stale wrangler-account.json pointing at the wrong CF account.
const wranglerEnv = {
  ...process.env,
  ...(accountId ? { CLOUDFLARE_ACCOUNT_ID: accountId } : {}),
};

await runCommand('npx', ['wrangler', 'whoami'], { cwd: repoRoot, env: wranglerEnv });
await runCommand('pnpm', ['--filter', '@bossraid/web', 'build'], {
  cwd: repoRoot,
  env: {
    ...wranglerEnv,
    VITE_BOSSRAID_API_BASE: apiOrigin,
    VITE_BOSSRAID_WEB_API_BASE: '/api',
  },
});

// Pages secrets: wrangler can pick the wrong account when OAuth + multi-account.
// Prefer API token + account id when CLOUDFLARE_API_TOKEN is set.
if (process.env.CLOUDFLARE_API_TOKEN && accountId) {
  await putPagesSecretViaApi({
    accountId,
    projectName: pagesProject,
    key: 'BOSSRAID_API_ORIGIN',
    value: apiOrigin,
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
  });
} else {
  await runCommand(
    'npx',
    ['wrangler', 'pages', 'secret', 'put', 'BOSSRAID_API_ORIGIN', '--project-name', pagesProject],
    {
      cwd: webDir,
      input: apiOrigin,
      env: wranglerEnv,
    }
  );
}

const deployArgs = ['wrangler', 'pages', 'deploy', 'dist', '--project-name', pagesProject];
if (pagesBranch) {
  deployArgs.push('--branch', pagesBranch);
}

await runCommand('npx', deployArgs, { cwd: webDir, env: wranglerEnv });

function readRequiredEnv(name) {
  const value = normalizeOptionalEnv(name);
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function normalizeOptionalEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeApiOrigin(value) {
  const origin = new URL(value);
  if (isIpv4Address(origin.hostname)) {
    origin.hostname = `${origin.hostname}.nip.io`;
  }
  const pathname = origin.pathname.endsWith('/') ? origin.pathname.slice(0, -1) : origin.pathname;
  origin.pathname = pathname || '/';
  origin.search = '';
  origin.hash = '';
  return origin.toString().replace(/\/$/, pathname === '/' ? '' : pathname);
}

function isIpv4Address(value) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value);
}

function runCommand(command, args, options) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ['pipe', 'inherit', 'inherit'],
    });

    if (options.input) {
      child.stdin.write(options.input);
    }
    child.stdin.end();

    child.on('error', rejectPromise);
    child.on('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}.`)
      );
    });
  });
}

async function putPagesSecretViaApi({ accountId, projectName, key, value, apiToken }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      deployment_configs: {
        production: {
          env_vars: {
            [key]: { type: 'secret_text', value },
          },
        },
        preview: {
          env_vars: {
            [key]: { type: 'secret_text', value },
          },
        },
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(
      `Failed to set Pages secret ${key}: ${response.status} ${JSON.stringify(payload.errors ?? payload)}`
    );
  }
}
