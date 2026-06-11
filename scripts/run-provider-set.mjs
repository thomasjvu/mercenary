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

const children = providerProfiles.map((profile, index) => {
  const child = spawn('node', ['apps/provider-agent/dist/apps/provider-agent/src/index.js'], {
    cwd: rootDir,
    stdio: 'inherit',
    env: buildProviderChildEnv(profile, index, inheritedEnv, {
      includePrivacyFeatures: true,
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
console.log(`[providers] started ${providerProfiles.length} built providers from ${providersFile}`);