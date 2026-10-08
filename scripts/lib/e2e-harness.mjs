import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { loadLocalEnv } from '../env.mjs';
import { runCommand, sleep, stopChild } from './process-harness.mjs';

const defaultRootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function createE2eEnv(options) {
  const {
    rootDir = defaultRootDir,
    defaultPortBase = 8700,
    sqlitePrefix = 'raid-e2e',
    providersFile,
    defaultProvidersFile = './examples/providers/empty.providers.json',
  } = options;

  loadLocalEnv(rootDir);

  const apiPort = Number(process.env.PORT ?? String(defaultPortBase + (Date.now() % 1000)));
  const apiBase = process.env.BOSSRAID_API_BASE ?? `http://127.0.0.1:${apiPort}`;
  const resolvedProvidersFile =
    providersFile ?? process.env.BOSSRAID_PROVIDERS_FILE ?? defaultProvidersFile;
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
  const runController = new AbortController();
  const abortRun = () => runController.abort();

  const teardown = async () => {
    if (teardownStarted) {
      return;
    }
    teardownStarted = true;
    await Promise.all([stopChild(apiChild), stopChild(providersChild)]);
  };

  process.once('SIGINT', abortRun);
  process.once('SIGTERM', abortRun);

  try {
    console.log(JSON.stringify({ step: 'build' }, null, 2));
    await runCommand(rootDir, env, 'pnpm', ['build']);

    console.log(
      JSON.stringify(
        { step: 'start_providers', providersFile: env.BOSSRAID_PROVIDERS_FILE },
        null,
        2
      )
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

    await waitForHealth(apiBase, options.minReadyProviders ?? 3, 90_000, runController.signal);

    console.log(JSON.stringify({ step: 'authenticate_test_wallet' }, null, 2));
    const sessionCookie = await createTestWalletSession(apiBase, runController.signal);

    console.log(JSON.stringify({ step: 'spawn_raid' }, null, 2));
    const spawnResponse = await fetchWithTimeout(
      new URL('/v1/raid', apiBase),
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: sessionCookie,
        },
        body: await readFixture(rootDir, options.raidFixture),
      },
      20_000,
      runController.signal
    );
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
      options.resultTimeoutMs,
      '/v1/raid',
      runController.signal
    );
    await options.verifyResult(result);
    if (options.afterVerify) {
      await options.afterVerify({ apiBase, spawnBody, result });
    }
    console.log(
      JSON.stringify(
        {
          step: 'verified',
          raidId: spawnBody.raidId,
          status: result.status,
          workstreams: result.synthesizedOutput?.workstreams?.length ?? 0,
          artifactTypes: [
            ...new Set(
              (result.synthesizedOutput?.artifacts ?? []).map(({ outputType }) => outputType)
            ),
          ],
          routedProviders: result.routingProof?.providers?.length ?? 0,
        },
        null,
        2
      )
    );
  } finally {
    process.off('SIGINT', abortRun);
    process.off('SIGTERM', abortRun);
    await teardown();
  }
}

async function createTestWalletSession(apiBase, signal) {
  const account = privateKeyToAccount(generatePrivateKey());
  const nonceResponse = await fetchWithTimeout(
    new URL('/v1/auth/nonce', apiBase),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ wallet: account.address }),
    },
    10_000,
    signal
  );
  if (!nonceResponse.ok) {
    throw new Error(
      `Auth nonce failed with ${nonceResponse.status}: ${await nonceResponse.text()}`
    );
  }

  const nonce = await nonceResponse.json();
  const signature = await account.signMessage({ message: nonce.message });
  const verifyResponse = await fetchWithTimeout(
    new URL('/v1/auth/verify', apiBase),
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: nonce.message, signature }),
    },
    10_000,
    signal
  );
  const setCookie = verifyResponse.headers.get('set-cookie');
  if (!verifyResponse.ok || !setCookie) {
    throw new Error(
      `Auth verification failed with ${verifyResponse.status}: ${await verifyResponse.text()}`
    );
  }

  return setCookie.split(';', 1)[0];
}

export async function waitForHealth(apiBase, minReadyProviders = 3, timeoutMs = 90_000, signal) {
  const url = `${apiBase}/health`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error('E2E smoke interrupted while waiting for provider health.');
    }
    const response = await fetchWithTimeout(url, {}, 5_000, signal).catch((error) => {
      if (signal?.aborted) {
        throw error;
      }
      return undefined;
    });
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
  resultPath = '/v1/raid',
  signal
) {
  const deadline = Date.now() + timeoutMs;
  const resultUrl = new URL(`${resultPath}/${encodeURIComponent(raidId)}/result`, apiBaseUrl);
  while (Date.now() < deadline) {
    if (signal?.aborted) {
      throw new Error('E2E smoke interrupted while waiting for the raid result.');
    }
    const response = await fetchWithTimeout(
      resultUrl,
      {
        headers: {
          'x-bossraid-raid-token': raidAccessToken,
        },
      },
      10_000,
      signal
    ).catch((error) => {
      if (signal?.aborted) {
        throw error;
      }
      return undefined;
    });
    if (!response) {
      await sleep(1_000);
      continue;
    }
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

function fetchWithTimeout(input, init, timeoutMs, parentSignal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = parentSignal ? AbortSignal.any([parentSignal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}

export async function readFixture(rootDir, relativePath) {
  return readFile(resolve(rootDir, relativePath), 'utf8');
}
