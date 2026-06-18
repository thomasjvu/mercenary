import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../env.mjs';
import { runCommand, sleep, stopChild } from './process-harness.mjs';

const defaultRootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function createE2eEnv(options) {
  const {
    rootDir = defaultRootDir,
    defaultPortBase = 8700,
    sqlitePrefix = 'raid-e2e',
    providersFile,
    defaultProvidersFile = './examples/providers.http.json',
  } = options;

  loadLocalEnv(rootDir);

  const apiPort = Number(process.env.PORT ?? String(defaultPortBase + (Date.now() % 1000)));
  const apiBase = process.env.BOSSRAID_API_BASE ?? `http://127.0.0.1:${apiPort}`;
  const explicitProvidersFile = process.env.BOSSRAID_PROVIDERS_FILE;
  const resolvedProvidersFile =
    explicitProvidersFile && explicitProvidersFile !== './examples/providers.http.json'
      ? explicitProvidersFile
      : providersFile ?? defaultProvidersFile;
  const explicitSqliteFile = process.env.BOSSRAID_SQLITE_FILE;
  const sqliteFile =
    explicitSqliteFile && explicitSqliteFile !== './temp/bossraid-state.sqlite'
      ? explicitSqliteFile
      : `./temp/${sqlitePrefix}-${Date.now()}.sqlite`;

  const env = {
    ...process.env,
    PORT: String(apiPort),
    BOSSRAID_STORAGE_BACKEND: process.env.BOSSRAID_STORAGE_BACKEND ?? 'sqlite',
    BOSSRAID_SQLITE_FILE: sqliteFile,
    BOSSRAID_PROVIDERS_FILE: resolvedProvidersFile,
    BOSSRAID_CALLBACK_BASE: process.env.BOSSRAID_CALLBACK_BASE ?? apiBase,
    BOSSRAID_X402_ENABLED: 'false',
    BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH: process.env.BOSSRAID_ALLOW_INSECURE_PROVIDER_AUTH ?? '1',
    BOSSRAID_HARD_EXECUTION_MS: process.env.BOSSRAID_HARD_EXECUTION_MS ?? '85000',
    BOSSRAID_MODEL_API_KEY: process.env.BOSSRAID_MODEL_API_KEY,
  };

  return { rootDir, apiBase, env };
}

export async function runRaidE2e(options) {
  const { rootDir, apiBase, env } = createE2eEnv(options);
  let providersChild;
  let apiChild;
  let teardownStarted = false;

  const teardown = async () => {
    if (teardownStarted) {
      return;
    }
    teardownStarted = true;
    await Promise.all([stopChild(apiChild), stopChild(providersChild)]);
  };

  process.on('SIGINT', () => void teardown());
  process.on('SIGTERM', () => void teardown());

  try {
    console.log(JSON.stringify({ step: 'build' }, null, 2));
    await runCommand(rootDir, env, 'pnpm', ['build']);

    console.log(
      JSON.stringify({ step: 'start_providers', providersFile: env.BOSSRAID_PROVIDERS_FILE }, null, 2)
    );
    providersChild = spawn('node', ['scripts/run-provider-set.mjs'], {
      cwd: rootDir,
      stdio: 'inherit',
      env,
    });

    console.log(JSON.stringify({ step: 'start_api', apiBase }, null, 2));
    apiChild = spawn('node', ['apps/api/dist/apps/api/src/index.js'], {
      cwd: rootDir,
      stdio: 'inherit',
      env,
    });

    await waitForHealth(apiBase, options.minReadyProviders ?? 3);

    console.log(JSON.stringify({ step: 'spawn_raid' }, null, 2));
    const spawnResponse = await fetch(new URL('/v1/raid', apiBase), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: await readFixture(rootDir, options.raidFixture),
    });
    if (!spawnResponse.ok) {
      throw new Error(`Spawn failed with ${spawnResponse.status}: ${await spawnResponse.text()}`);
    }

    const spawnBody = await spawnResponse.json();
    if (typeof spawnBody.raidId !== 'string' || typeof spawnBody.raidAccessToken !== 'string') {
      throw new Error(`Unexpected spawn response: ${JSON.stringify(spawnBody)}`);
    }

    console.log(JSON.stringify({ step: 'spawned', raidId: spawnBody.raidId }, null, 2));
    const result = await waitForResult(
      apiBase,
      spawnBody.raidId,
      spawnBody.raidAccessToken,
      options.resultTimeoutMs
    );
    await options.verifyResult(result);
    if (options.afterVerify) {
      await options.afterVerify({ apiBase, spawnBody, result });
    }
    console.log(JSON.stringify({ step: 'verified', raidId: spawnBody.raidId, result }, null, 2));
  } finally {
    await teardown();
  }
}

export async function waitForHealth(apiBase, minReadyProviders = 3, timeoutMs = 90_000) {
  const url = `${apiBase}/health`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await fetch(url).catch(() => undefined);
    if (response?.ok) {
      const payload = await response.json();
      if (payload.readyProviders >= minReadyProviders) {
        console.log(JSON.stringify({ step: 'health_ready', payload }, null, 2));
        return payload;
      }
    }
    await sleep(1_000);
  }
  throw new Error(`Timed out waiting for provider health at ${url}`);
}

export async function waitForResult(
  apiBaseUrl,
  raidId,
  raidAccessToken,
  timeoutMs = 120_000,
  resultPath = '/v1/raid'
) {
  const deadline = Date.now() + timeoutMs;
  const resultUrl = new URL(
    `${resultPath}/${encodeURIComponent(raidId)}/result`,
    apiBaseUrl
  );
  while (Date.now() < deadline) {
    const response = await fetch(resultUrl, {
      headers: {
        'x-bossraid-raid-token': raidAccessToken,
      },
    });
    if (!response.ok) {
      throw new Error(`Result poll failed with ${response.status}: ${await response.text()}`);
    }
    const payload = await response.json();
    if (payload.status === 'final') {
      return payload;
    }
    await sleep(1_000);
  }
  throw new Error(`Timed out waiting for final raid result for ${raidId}`);
}

export async function readFixture(rootDir, relativePath) {
  return readFile(resolve(rootDir, relativePath), 'utf8');
}

