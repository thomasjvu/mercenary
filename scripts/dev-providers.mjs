import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './env.mjs';
import {
  attachProviderShutdown,
  buildProviderChildEnv,
  loadProviderProfiles,
} from './lib/provider-launcher.mjs';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadLocalEnv(rootDir);
const inheritedEnv = process.env;
const { providersFile, providerProfiles } = loadProviderProfiles(rootDir, inheritedEnv);

const sharedModelConfigured =
  Boolean(inheritedEnv.BOSSRAID_MODEL_API_KEY) && Boolean(inheritedEnv.BOSSRAID_MODEL);
const providerStubMode =
  inheritedEnv.BOSSRAID_PROVIDER_STUB_MODE === '1' ||
  inheritedEnv.BOSSRAID_PROVIDER_STUB_MODE === 'true' ||
  inheritedEnv.BOSSRAID_PROVIDER_STUB_MODE === 'yes';

if (!sharedModelConfigured && !providerStubMode) {
  console.error(
    'Missing shared model env. Falling back to BOSSRAID_PROVIDER_STUB_MODE for local provider responses.'
  );
}

const children = providerProfiles.map((profile, index) => {
  const child = spawn('pnpm', ['--filter', '@bossraid/provider-agent', 'dev'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: buildProviderChildEnv(profile, index, inheritedEnv, {
      includeStubMode: true,
      includeCallbackBase: true,
    }),
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      console.log(`[providers] ${profile.providerId} exited via signal ${signal}`);
      return;
    }
    console.log(`[providers] ${profile.providerId} exited with code ${code ?? 0}`);
  });

  return child;
});

attachProviderShutdown(children);
console.log(`[providers] started ${providerProfiles.length} dev providers from ${providersFile}`);